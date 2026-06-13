from fastapi import FastAPI

app = FastAPI(title="swarm-demo-target")


@app.get("/")
def root() -> dict[str, str]:
    return {"hello": "world"}
