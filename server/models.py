from pydantic import BaseModel
from typing import Optional, List


class TodoIn(BaseModel):
    id: int
    text: str
    completed: bool
    dueDate: Optional[str] = None
    repeat: Optional[str] = None  # daily | weekly | monthly | yearly
    timestamp: str


class ClassifiedTodo(BaseModel):
    id: int
    category: str     # Work | Personal | Health | Finance | Learning | Home | Social | Other
    importance: int   # 1–10, where 10 is most important
    reasoning: str    # one-line explanation from the model


class ClassifyRequest(BaseModel):
    todos: List[TodoIn]


class ClassifyResponse(BaseModel):
    results: List[ClassifiedTodo]
