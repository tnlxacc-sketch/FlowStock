import ast
import importlib.util
from pathlib import Path
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'scripts/restore-api-uat.py'

class RestoreApiUatSafetyTests(unittest.TestCase):
    def test_script_is_pinned_to_test_and_never_queries_source(self):
        source=SCRIPT.read_text()
        self.assertIn("BASE='https://avofysgyuthbixthugcp.supabase.co'",source)
        self.assertNotIn('ifanefgaiuzkbjtttiqn.supabase.co',source)
        self.assertNotIn('source=True)',source)
        self.assertNotIn('source=True,',source)

    def test_all_database_calls_are_explicitly_target_only(self):
        tree=ast.parse(SCRIPT.read_text())
        calls=[node for node in ast.walk(tree) if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr in {'sql','pg'}]
        self.assertTrue(calls)
        for call in calls:
            source=[kw for kw in call.keywords if kw.arg=='source']
            self.assertEqual(len(source),1)
            self.assertIsInstance(source[0].value,ast.Constant)
            self.assertIs(source[0].value.value,False)

    def test_release_claim_remains_false_and_cleanup_is_guarded(self):
        source=SCRIPT.read_text()
        self.assertIn("'full_system_uat_passed':False",source)
        self.assertIn("'api_smoke_passed':False",source)
        self.assertIn('except Exception as cleanup_exc:',source)
        self.assertIn("'temporary_auth_fixtures_remaining'",source)

if __name__=='__main__':unittest.main()
