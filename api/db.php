<?php
header("Content-Type: application/json; charset=utf-8");

$configFile = __DIR__ . '/config.local.php';
if (file_exists($configFile)) {
    require_once $configFile;
    $DB_HOST = defined('DB_HOST') ? DB_HOST : 'localhost';
    $DB_NAME = defined('DB_NAME') ? DB_NAME : '';
    $DB_USER = defined('DB_USER') ? DB_USER : '';
    $DB_PASS = defined('DB_PASS') ? DB_PASS : '';
} else {
    // fallback para variáveis de ambiente
    $DB_HOST = getenv('DB_HOST') ?: 'localhost';
    $DB_NAME = getenv('DB_NAME') ?: '';
    $DB_USER = getenv('DB_USER') ?: '';
    $DB_PASS = getenv('DB_PASS') ?: '';
}

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "DB connection failed"]);
    exit;
}
$conn->set_charset("utf8mb4");
