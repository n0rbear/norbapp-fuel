import os
import sys
from pathlib import Path

os.environ["BASE_PRICE_AUTO_REFRESH"] = "false"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
