import tempfile
import unittest
from pathlib import Path

import database


class WatchlistTest(unittest.TestCase):
    def test_watchlist_round_trip_is_normalized_and_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            original_dir, original_path = database.DATA_DIR, database.DB_PATH
            database.DATA_DIR = Path(tmp)
            database.DB_PATH = Path(tmp) / "watchlist.db"
            try:
                database.init_db()
                added = database.add_watchlist_item(" aapl ", "Apple Inc.")
                self.assertEqual(added["ticker"], "AAPL")
                duplicate = database.add_watchlist_item("AAPL", "Apple")
                self.assertEqual(duplicate["id"], added["id"])
                self.assertEqual(len(database.get_watchlist()), 1)
                self.assertTrue(database.delete_watchlist_item("aapl"))
                self.assertEqual(database.get_watchlist(), [])
            finally:
                database.DATA_DIR, database.DB_PATH = original_dir, original_path


if __name__ == "__main__":
    unittest.main()
