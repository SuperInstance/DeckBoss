# apps/cli/deckboss/cli.py
import typer
from rich.console import Console

app = typer.Typer()
console = Console()

@app.command()
def init():
    """One-click DeckBoss setup (opens CF login)."""
    console.print("🚀 Initializing Agent Edge OS...", style="bold green")
    # Calls wrangler via subprocess, provisions Vectorize/DO, etc.
    # Matches the init script we drafted earlier

@app.command()
def launch(agent: str, mission: str, background: bool = False):
    """Launch mission – forwards to Director via MCP/HTTP."""
    # ...

if __name__ == "__main__":
    app()
