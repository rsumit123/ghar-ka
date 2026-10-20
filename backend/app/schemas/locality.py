from pydantic import BaseModel, ConfigDict


class LocalityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    city: str
    pincode: str
    lat: float
    lng: float
