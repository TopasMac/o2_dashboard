<?php
header('Content-Type: text/plain');
echo "SAPI=" . php_sapi_name() . PHP_EOL;
echo "SERVER_SOFTWARE=" . ($_SERVER['SERVER_SOFTWARE'] ?? '(none)') . PHP_EOL;
echo "TMPDIR=" . (getenv('TMPDIR') ?: '(empty)') . PHP_EOL;
echo "sys_get_temp_dir=" . sys_get_temp_dir() . PHP_EOL;
