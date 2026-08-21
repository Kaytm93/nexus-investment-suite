import tempfile
import unittest
from pathlib import Path

import database


class TransactionHistoryTest(unittest.TestCase):
    def test_transaction_history_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            original_dir, original_path = database.DATA_DIR, database.DB_PATH
            database.DATA_DIR = tmp_path
            database.DB_PATH = tmp_path / "test.db"
            try:
                database.init_db()
                position = database.add_position(
                    ticker="AAPL",
                    name="Apple",
                    entry_price=180.0,
                    shares=2.0,
                    purchase_date="2026-08-21",
                )

                history = database.get_position_transactions(position["id"])

                self.assertEqual(len(history), 1)
                self.assertEqual(history[0]["entry_price"], 180.0)
                self.assertEqual(history[0]["shares"], 2.0)

                added = database.add_position_transaction(
                    position["id"], 175.5, 1.5, "2026-08-22"
                )
                self.assertEqual(added["entry_price"], 175.5)
                self.assertEqual(len(database.get_position_transactions(position["id"])), 2)

                self.assertTrue(database.delete_position_transaction(added["id"]))
                self.assertEqual(len(database.get_position_transactions(position["id"])), 1)
            finally:
                database.DATA_DIR, database.DB_PATH = original_dir, original_path


if __name__ == "__main__":
    unittest.main()
