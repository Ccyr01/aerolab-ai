
from pathlib import Path
from zipfile import ZipFile
import pandas as pd

data_dir = Path("data")

with ZipFile(data_dir / "airfoil.zip") as archive:
    print("Files in dataset:", archive.namelist())
    archive.extractall(data_dir)

data_file = data_dir / "airfoil_self_noise.dat"

columns = [
    "frequency",
    "angle_of_attack",
    "chord_length",
    "velocity",
    "displacement_thickness",
    "sound_pressure_level",
]

df = pd.read_csv(
    data_file,
    sep=r"\s+",
    header=None,
    names=columns,
)

print("\nDataset shape:", df.shape)
print("\nFirst five rows:")
print(df.head())

print("\nDataset statistics:")
print(df.describe())

print("\nMissing values:")
print(df.isnull().sum())
