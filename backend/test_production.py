import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from backend import main


class TrainingGateTests(unittest.TestCase):
    def test_disabled_training_never_calls_runner(self):
        request = main.ExperimentInput(algorithm="Linear Regression")
        for value in ("false", "0", "no", "", "invalid"):
            with self.subTest(value=value), patch.dict(os.environ, ENABLE_TRAINING=value):
                with patch.object(main, "run_experiment") as runner:
                    with self.assertRaises(HTTPException) as result:
                        main.train_experiment(request)
                    self.assertEqual(result.exception.status_code, 403)
                    runner.assert_not_called()

    def test_local_training_remains_available_without_fitting(self):
        request = main.ExperimentInput(algorithm="Linear Regression")
        with patch.dict(os.environ):
            os.environ.pop("ENABLE_TRAINING", None)
            with patch.object(main, "run_experiment", return_value={"mocked": True}) as runner:
                self.assertEqual(main.train_experiment(request), {"mocked": True})
                runner.assert_called_once_with(algorithm="Linear Regression", params={})


if __name__ == "__main__":
    unittest.main()
