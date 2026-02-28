import json
import logging
from datetime import datetime, timezone
from typing import List

import ollama

from models import TodoIn, ClassifiedTodo

logger = logging.getLogger(__name__)

MODEL = "llama3.2"

CATEGORIES = ["Work", "Personal", "Health", "Finance", "Learning", "Home", "Social", "Other"]

SYSTEM_PROMPT = """\
You are a productivity assistant that classifies todo items and ranks their importance.

For each todo item you will determine:
1. category — exactly one of: Work, Personal, Health, Finance, Learning, Home, Social, Other
2. importance — integer 1-10 (10 = most critical), factoring in:
   - Due date proximity: overdue or within 24 hours = higher importance
   - Repeat frequency: daily tasks are generally high-priority recurring commitments
   - Keywords implying urgency: "urgent", "asap", "deadline", "doctor", "bill", "call", etc.
   - Task nature: health and finance items tend to carry higher stakes
   - Completed tasks: always score 1 regardless of other factors
3. reasoning — one concise sentence explaining the classification and score

Always return a JSON array. Never include markdown or explanatory text outside the JSON.\
"""


def _build_user_prompt(todos: List[TodoIn]) -> str:
    now = datetime.now(timezone.utc).isoformat()

    serialized = [
        {
            "id": t.id,
            "text": t.text,
            "completed": t.completed,
            "dueDate": t.dueDate,
            "repeat": t.repeat,
        }
        for t in todos
    ]

    example = json.dumps(
        {"results": [{"id": 0, "category": "Work", "importance": 7, "reasoning": "Example reasoning."}]},
        indent=2,
    )

    return (
        f"Current UTC time: {now}\n\n"
        f"Classify these {len(todos)} todo items:\n"
        f"{json.dumps(serialized, indent=2)}\n\n"
        f"Return a JSON object with a 'results' key containing exactly {len(todos)} objects, one per todo, in the same order.\n"
        f"Example format:\n{example}"
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
            category = item.get("category", "Other")
            if category not in CATEGORIES:
                category = "Other"
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
