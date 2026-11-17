"""Entry point: run with `python main.py`."""

from dotenv import load_dotenv

from agents.base import EchoAgent


def main() -> None:
    load_dotenv()  # loads keys from .env into environment variables
    agent = EchoAgent("echo")
    print(agent.run("Hello, agents!"))


if __name__ == "__main__":
    main()
