<?php
header("Content-Type: application/json; charset=utf-8");

$DB_HOST = "localhost";
$DB_NAME = "medicoredb";
$DB_USER = "meusite_user";
$DB_PASS = "SenhaForte123!"; // <-- edite no servidor

$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(["ok" => false, "error" => "DB connection failed"]);
  exit;
}
$conn->set_charset("utf8mb4");
