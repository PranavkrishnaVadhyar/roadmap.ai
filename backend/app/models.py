from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class Base(DeclarativeBase):
    pass


class Roadmap(Base):
    __tablename__ = "roadmaps"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("rm"))
    title: Mapped[str] = mapped_column(String(255))
    goal_description: Mapped[str | None] = mapped_column(Text)
    share_token: Mapped[str | None] = mapped_column(String(128), unique=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    nodes: Mapped[list["Node"]] = relationship(back_populates="roadmap", cascade="all, delete-orphan")
    edges: Mapped[list["Edge"]] = relationship(back_populates="roadmap", cascade="all, delete-orphan")
    todos: Mapped[list["TodoItem"]] = relationship(back_populates="roadmap", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "nodes"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("nd"))
    roadmap_id: Mapped[str] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    position_x: Mapped[float] = mapped_column(Float, default=0)
    position_y: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(32), default="not_started")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    roadmap: Mapped[Roadmap] = relationship(back_populates="nodes")
    materials: Mapped[list["Material"]] = relationship(back_populates="node", cascade="all, delete-orphan")


class Edge(Base):
    __tablename__ = "edges"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("ed"))
    roadmap_id: Mapped[str] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True)
    source_node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    target_node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    roadmap: Mapped[Roadmap] = relationship(back_populates="edges")


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("mt"))
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(2048))
    resource_type: Mapped[str] = mapped_column(String(32), default="other")
    source: Mapped[str] = mapped_column(String(32), default="ai_search")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    node: Mapped[Node] = relationship(back_populates="materials")


class TodoItem(Base):
    __tablename__ = "todo_items"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: new_id("td"))
    roadmap_id: Mapped[str] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str | None] = mapped_column(ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(500))
    is_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(32), default="ai")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    roadmap: Mapped[Roadmap] = relationship(back_populates="todos")
