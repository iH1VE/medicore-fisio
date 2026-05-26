<?php
require __DIR__ . '/db.php';
session_destroy();
echo json_encode(['ok' => true]);
