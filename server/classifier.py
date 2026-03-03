import json
import logging
from datetime import datetime, timezone
from typing import List

import ollama

from models import TodoIn, ClassifiedTodo

logger = logging.getLogger(__name__)

MODEL = "llama3.2:1b"

CATEGORIES = ["Work", "Personal", "Health", "Finance", "Learning", "Home", "Social", "Other"]

# Map common model synonyms → canonical category name (case-insensitive key lookup)
_CATEGORY_SYNONYMS: dict[str, str] = {
    # Work
    "work": "Work", "job": "Work", "professional": "Work", "career": "Work",
    "business": "Work", "office": "Work", "employment": "Work",
    # Personal
    "personal": "Personal", "self": "Personal", "life": "Personal",
    # Health
    "health": "Health", "medical": "Health", "fitness": "Health",
    "wellness": "Health", "exercise": "Health", "mental health": "Health",
    # Finance
    "finance": "Finance", "financial": "Finance", "money": "Finance",
    "budget": "Finance", "banking": "Finance", "investment": "Finance",
    # Learning
    "learning": "Learning", "education": "Learning", "study": "Learning",
    "school": "Learning", "academic": "Learning", "course": "Learning",
    "research": "Learning", "reading": "Learning",
    # Home
    "home": "Home", "household": "Home", "chores": "Home", "house": "Home",
    "domestic": "Home", "cleaning": "Home", "errands": "Home",
    # Social
    "social": "Social", "family": "Social", "friends": "Social",
    "relationship": "Social", "community": "Social", "entertainment": "Social",
    # Other
    "other": "Other", "miscellaneous": "Other", "misc": "Other",
}


def _normalize_category(raw: str) -> str:
    return _CATEGORY_SYNONYMS.get(raw.strip().lower(), "Other")

SYSTEM_PROMPT = (
    "Classify todo items. For each, return category (Work/Personal/Health/Finance/Learning/Home/Social/Other), "
    "importance 1-10 (10=most urgent; consider due date, repeat, urgency keywords; completed=1), "
    "and a one-sentence reasoning. Respond only with JSON."
)


def _build_user_prompt(todos: List[TodoIn]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    items = [
        {"id": t.id, "text": t.text, "done": t.completed, "due": t.dueDate, "repeat": t.repeat}
        for t in todos
    ]

    return (
        f"Now: {now}\n"
        f"Todos: {json.dumps(items)}\n"
        f'Return: {{"results":[{{"id":...,"category":"...","importance":...,"reasoning":"..."}}]}}'
    )


def _parse_response(raw: str, todos: List[TodoIn]) -> List[ClassifiedTodo]:
    """Parse the model's JSON response, falling back gracefully on any item that fails."""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError(f"Could not parse model response: {raw[:200]}")
        parsed = json.loads(raw[start:end])

    # Normalise: accept {"results": [...]} or a plain list or a dict of values
    if isinstance(parsed, dict):
        if "results" in parsed and isinstance(parsed["results"], list):
            data = parsed["results"]
        else:
            # Dict whose values are the result objects (fallback for unexpected formats)
            data = [v for v in parsed.values() if isinstance(v, dict)]
    else:
        data = parsed

    id_to_result: dict[int, ClassifiedTodo] = {}
    for item in data:
        try:
            category = _normalize_category(item.get("category", "Other"))
            importance = max(1, min(10, int(item.get("importance", 5))))
            id_to_result[item["id"]] = ClassifiedTodo(
                id=item["id"],
                category=category,
                importance=importance,
                reasoning=item.get("reasoning", ""),
            )
        except Exception as e:
            logger.warning(f"Skipping malformed result item: {item} — {e}")

    # Ensure every input todo has a result, using a neutral fallback if missing
    results = []
    for todo in todos:
        if todo.id in id_to_result:
            results.append(id_to_result[todo.id])
        else:
            results.append(
                ClassifiedTodo(id=todo.id, category="Other", importance=5, reasoning="Could not classify.")
            )
    return results


def classify(todos: List[TodoIn]) -> List[ClassifiedTodo]:
    """Send todos to the local Ollama model and return classified results."""
    if not todos:
        return []

    user_prompt = _build_user_prompt(todos)

    logger.info(f"Classifying {len(todos)} todos with {MODEL}...")

    response = ollama.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        format="json",
    )

    # ollama>=0.4 returns a Pydantic ChatResponse object; older versions return a dict
    if hasattr(response, "message"):
        raw = response.message.content
    else:
        raw = response["message"]["content"]

    logger.info(f"Raw model response: {raw[:300]}")

    results = _parse_response(raw, todos)
    logger.info(f"Classification complete: {len(results)} items classified.")
    return results
