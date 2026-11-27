import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh_local_database.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class DumpSafetyTests(unittest.TestCase):
    def test_standard_dump_and_quoted_customer_text(self):
        refresh.validate_dump("/*!40101 SET NAMES utf8mb4 */; CREATE TABLE `event` (`id` int); INSERT INTO `event` VALUES ('USE prod; DATABASE');")

    def test_rejects_redirection_and_executable_directives(self):
        for statement in ['USE production;', 'CREATE DATABASE production;',
                          '/*!50000 USE production */;',
                          '\\! echo unsafe',
                          'DELIMITER ;;', 'CREATE TRIGGER x;',
                          "SELECT 1 INTO OUTFILE '/tmp/result';"]:
            with self.subTest(statement=statement), self.assertRaises(ValueError):
                refresh.validate_dump('CREATE TABLE `sample` (`id` int);' + statement)

    def test_view_owner_is_localized_without_changing_values(self):
        result = refresh.prepare_dump('CREATE TABLE `sample` (`id` int); /*!50013 DEFINER=`admin`@`%` SQL SECURITY DEFINER */;')
        self.assertIn(b'DEFINER=CURRENT_USER', result)

    def test_customer_values_are_not_rewritten(self):
        sql = "CREATE TABLE `sample` (`id` int); INSERT INTO `sample` VALUES ('SQL SECURITY DEFINER DEFINER=`admin`@`%`');"
        self.assertEqual(refresh.prepare_dump(sql), sql.encode())

    def test_nonlocal_container_is_rejected(self):
        import json
        from types import SimpleNamespace
        info = {'Config': {'Env': ['MYSQL_DATABASE=production'], 'Image': 'mysql:8.0.43'}, 'HostConfig': {}, 'State': {'Running': True}}
        with patch.object(refresh, 'run', return_value=SimpleNamespace(stdout=json.dumps([info]))), self.assertRaises(ValueError):
            refresh.inspect_target()

    def test_check_never_imports(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.sql'
            backup.write_text('CREATE TABLE `sample` (`id` int);')
            with patch('sys.argv', ['refresh', str(backup), '--check']), patch.object(refresh, 'inspect_target', return_value='local-id'), patch.object(refresh, 'mysql') as mysql:
                refresh.main()
                mysql.assert_called_once_with('local-id', b'SELECT 1;')

    def test_cancellation_never_imports(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.sql'
            backup.write_text('CREATE TABLE `sample` (`id` int);')
            with patch('sys.argv', ['refresh', str(backup)]), patch.object(refresh, 'inspect_target', return_value='local-id'), patch.object(refresh, 'mysql') as mysql, patch('builtins.input', return_value='no'):
                refresh.main()
                mysql.assert_called_once_with('local-id', b'SELECT 1;')


if __name__ == '__main__':
    unittest.main()
