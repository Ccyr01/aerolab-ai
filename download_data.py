
from pathlib import Path
from urllib.request import urlretrieve

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

url = "https://archive.ics.uci.edu/static/public/291/airfoil+self+noise.zip"
destination = DATA_DIR / "airfoil.zip"

print("Downloading NASA Airfoil Self-Noise dataset...")
urlretrieve(url, destination)

print(f"Downloaded to: {destination}")
