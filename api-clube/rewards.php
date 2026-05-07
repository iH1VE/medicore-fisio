<?php
require __DIR__ . '/_common.php';

$res = $conn->query("SELECT * FROM club_rewards WHERE ativo = 1 ORDER BY pontos ASC, id ASC");

$rewards = [];
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $rewards[] = $row;
    }
}

club_respond([
    "ok" => true,
    "rewards" => $rewards
]);
