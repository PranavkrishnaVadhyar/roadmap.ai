from fastapi.testclient import TestClient

from app import ai_service
from app.main import app
from app.schemas import (ChatResponse, GeneratedEdge, GeneratedNode, GeneratedRoadmap, GeneratedTodo,
                         MaterialCandidate, Message, RoadmapEdit)


def test_roadmap_todo_and_share_flow(monkeypatch):
    async def make_roadmap(_):
        return GeneratedRoadmap(title="Python", goal_description="Learn Python", nodes=[
            GeneratedNode(temp_id="a", title="Basics"), GeneratedNode(temp_id="b", title="Testing")],
            edges=[GeneratedEdge(source_temp_id="a", target_temp_id="b")])

    async def make_todos(roadmap):
        return [GeneratedTodo(node_id=node["id"], title=f"Read {node['title']}") for node in roadmap["nodes"]]

    async def find_materials(_, __):
        return [MaterialCandidate(title="FastAPI tutorial", url="https://fastapi.tiangolo.com/tutorial/", resource_type="doc")]

    monkeypatch.setattr(ai_service, "generate_roadmap", make_roadmap)
    monkeypatch.setattr(ai_service, "generate_todos", make_todos)
    monkeypatch.setattr(ai_service, "search_materials", find_materials)
    with TestClient(app) as client:
        created = client.post("/roadmaps", json={"chat_history": [{"role": "user", "content": "Learn Python"}]})
        assert created.status_code == 201
        roadmap = created.json(); roadmap_id = roadmap["id"]
        assert len(roadmap["nodes"]) == 2
        assert roadmap["nodes"][0]["materials"][0]["url"] == "https://fastapi.tiangolo.com/tutorial/"
        assert client.patch(f"/roadmaps/{roadmap_id}/nodes/{roadmap['nodes'][0]['id']}", json={"status": "in_progress"}).status_code == 200
        assert client.post(f"/roadmaps/{roadmap_id}/todos/generate", json={}).status_code == 200
        manual = client.post(f"/roadmaps/{roadmap_id}/todos", json={"title": "Book time"})
        assert manual.status_code == 201
        share = client.post(f"/roadmaps/{roadmap_id}/share")
        assert share.status_code == 200
        token = share.json()["share_token"]
        assert client.get(f"/share/{token}").status_code == 200
        assert client.delete(f"/roadmaps/{roadmap_id}/share").status_code == 204
        assert client.get(f"/share/{token}").status_code == 404
        assert client.delete(f"/roadmaps/{roadmap_id}").status_code == 204


def test_invalid_graph_is_rejected():
    from app.services.roadmaps import validate_graph
    cyclic = GeneratedRoadmap(title="cycle", nodes=[GeneratedNode(temp_id="a", title="A"), GeneratedNode(temp_id="b", title="B")],
        edges=[GeneratedEdge(source_temp_id="a", target_temp_id="b"), GeneratedEdge(source_temp_id="b", target_temp_id="a")])
    try:
        validate_graph(cyclic)
    except ValueError as exc:
        assert "acyclic" in str(exc)
    else:
        raise AssertionError("A cyclic graph must be rejected")


def test_chat_and_ai_edit_regenerate_todos(monkeypatch):
    async def chat_reply(messages):
        return ChatResponse(ready_to_generate=True, chat_history=[*messages, Message(role="assistant", content="Ready")])

    async def make_roadmap(_):
        return GeneratedRoadmap(title="Go", nodes=[GeneratedNode(temp_id="a", title="Syntax")])

    async def edit_roadmap(_, __):
        return RoadmapEdit(add_nodes=[GeneratedNode(temp_id="b", title="Concurrency")])

    async def make_todos(roadmap):
        return [GeneratedTodo(node_id=node["id"], title=f"Study {node['title']}") for node in roadmap["nodes"]]

    monkeypatch.setattr(ai_service, "continue_chat", chat_reply)
    monkeypatch.setattr(ai_service, "generate_roadmap", make_roadmap)
    monkeypatch.setattr(ai_service, "edit_roadmap", edit_roadmap)
    monkeypatch.setattr(ai_service, "generate_todos", make_todos)
    with TestClient(app) as client:
        assert client.post("/chat", json={"chat_history": [{"role": "user", "content": "Learn Go"}]}).json()["ready_to_generate"]
        created = client.post("/roadmaps", json={"chat_history": [{"role": "user", "content": "Learn Go"}]}).json()
        edited = client.post(f"/roadmaps/{created['id']}/edit", json={"query": "Add concurrency"})
        assert edited.status_code == 200
        assert len(edited.json()["nodes"]) == 2
        todos = client.get(f"/roadmaps/{created['id']}/todos").json()["todos"]
        assert len(todos) == 2
        assert client.delete(f"/roadmaps/{created['id']}").status_code == 204


def test_ready_chat_request_does_not_call_ai(monkeypatch):
    async def unexpected_call(_):
        raise AssertionError("The completed chat must not call OpenAI again")

    monkeypatch.setattr(ai_service, "continue_chat", unexpected_call)
    with TestClient(app) as client:
        response = client.post("/chat", json={"ready_to_generate": True,
            "chat_history": [{"role": "user", "content": "Learn FastAPI"}, {"role": "assistant", "content": "Ready"}]})
    assert response.status_code == 200
    assert response.json()["ready_to_generate"] is True
    assert len(response.json()["chat_history"]) == 2
