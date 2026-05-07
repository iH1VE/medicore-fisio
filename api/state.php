<?php
require __DIR__ . "/db.php";

$method = $_SERVER["REQUEST_METHOD"];

if ($method === "GET") {
  $res = $conn->query("SELECT json FROM app_state WHERE id=1 LIMIT 1");
  if ($res && $row = $res->fetch_assoc()) {
    echo $row["json"];
  } else {
    echo "{}";
  }
  exit;
}

if ($method === "POST") {
  $raw = file_get_contents("php://input");
  if (!$raw) $raw = "{}";

  json_decode($raw, true);
  if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "Invalid JSON"]);
    exit;
  }

  $stmt = $conn->prepare("UPDATE app_state SET json=? WHERE id=1");
  $stmt->bind_param("s", $raw);
  $stmt->execute();

  echo json_encode(["ok" => true]);
  exit;
}

http_response_code(405);
echo json_encode(["ok" => false, "error" => "Method not allowed"]);
