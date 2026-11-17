"""Base class that every agent builds on."""


class Agent:
    def __init__(self, name: str):
        self.name = name

    def run(self, task: str) -> str:
        """Do the task and return a result. Each agent overrides this."""
        raise NotImplementedError


class EchoAgent(Agent):
    """A simple example agent that repeats the task back."""

    def run(self, task: str) -> str:
        return f"[{self.name}] received task: {task}"
