<?php
// Router for PHP's built-in web server.
// If the requested resource exists as a file, serve it directly.
// Otherwise forward the request to Symfony front controller.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;

if ($path !== '/' && is_file($file)) {
    return false;
}

return require __DIR__ . '/index.php';
