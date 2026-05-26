<?php
if (session_status() === PHP_SESSION_NONE) session_start();
header("Content-Type: application/json; charset=utf-8");

// Carrega credenciais do arquivo local (não commitado)
$_config = __DIR__ . '/config.local.php';
if (file_exists($_config)) {
    require_once $_config;
}

$DB_HOST = defined('DB_HOST') ? DB_HOST : (getenv('DB_HOST') ?: 'localhost');
$DB_NAME = defined('DB_NAME') ? DB_NAME : (getenv('DB_NAME') ?: 'medicoredb');
$DB_USER = defined('DB_USER') ? DB_USER : (getenv('DB_USER') ?: '');
$DB_PASS = defined('DB_PASS') ? DB_PASS : (getenv('DB_PASS') ?: '');

if ($DB_USER === '' || $DB_PASS === '') {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "DB not configured — create api/config.local.php"]);
    exit;
}

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "DB connection failed"]);
    exit;
}
$conn->set_charset("utf8mb4");
