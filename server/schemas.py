from typing import Literal, Optional

from pydantic import BaseModel, Field


class PartnerInfo(BaseModel):
    id: str
    email: str
    username: Optional[str] = None


class MeResponse(BaseModel):
    id: str
    email: str
    username: Optional[str] = None
    invite_code: str
    partner: Optional[PartnerInfo] = None


class UpdateMeRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=1, max_length=32)


class PairRequest(BaseModel):
    invite_code: str = Field(min_length=1)


class TodoOut(BaseModel):
    id: str
    owner_id: str
    text: str
    x: float
    y: float
    completed: bool
    dueDate: Optional[str] = None
    repeat: Optional[str] = None
    timestamp: str

    class Config:
        from_attributes = True


class TodoCreate(BaseModel):
    text: str = ""
    x: float = 0.0
    y: float = 0.0
    completed: bool = False
    dueDate: Optional[str] = None
    repeat: Optional[str] = None
    timestamp: str


class TodoPatch(BaseModel):
    text: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    completed: Optional[bool] = None
    dueDate: Optional[str] = None
    repeat: Optional[str] = None
    timestamp: Optional[str] = None


TodoScope = Literal["mine", "partner"]
