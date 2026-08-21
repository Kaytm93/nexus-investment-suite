import json
import math
import unittest

from yfinance_service import YFinanceService
from main import format_sse_event


class LiveMarketTest(unittest.TestCase):
    def test_nan_prices_are_ignored_in_yfinance_results(self):
        service = YFinanceService()
        result = service._build_result("AAPL", {
            "longName": "Apple Inc.",
            "currentPrice": math.nan,
            "regularMarketPrice": math.nan,
            "previousClose": math.nan,
        })
        self.assertIsNone(result["current_price"])
        service.close()

    def test_sse_event_is_valid_json_with_event_name(self):
        payload = {"indices": [{"symbol": "SPX", "price": 5000.0}]}
        event = format_sse_event("market", payload)
        self.assertEqual(event.splitlines()[0], "event: market")
        self.assertEqual(json.loads(event.splitlines()[1][6:]), payload)
        self.assertTrue(event.endswith("\n\n"))


if __name__ == "__main__":
    unittest.main()
