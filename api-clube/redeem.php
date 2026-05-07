<?php
require __DIR__ . '/_common.php';
require __DIR__ . '/_points_engine.php';

$user = club_require_auth();
$data = club_json_input();

$rewardId = (int)($data['reward_id'] ?? 0);

if ($rewardId <= 0) {
    club_respond(["ok" => false, "error" => "reward_id inválido"], 400);
}

$stmt = $conn->prepare("SELECT * FROM club_rewards WHERE id = ? AND ativo = 1 LIMIT 1");
$stmt->bind_param("i", $rewardId);
$stmt->execute();
$res = $stmt->get_result();
$reward = $res ? $res->fetch_assoc() : null;
$stmt->close();

if (!$reward) {
    club_respond(["ok" => false, "error" => "Recompensa não encontrada"], 404);
}

$pontosNecessarios = (int)$reward['pontos'];

$stmt = $conn->prepare("SELECT pontos FROM club_users WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $user['id']);
$stmt->execute();
$res = $stmt->get_result();
$row = $res ? $res->fetch_assoc() : null;
$stmt->close();

$currentPoints = (int)($row['pontos'] ?? 0);

if ($currentPoints < $pontosNecessarios) {
    club_respond(["ok" => false, "error" => "Pontos insuficientes"], 400);
}

if (!is_null($reward['estoque']) && (int)$reward['estoque'] <= 0) {
    club_respond(["ok" => false, "error" => "Sem estoque"], 400);
}

$conn->begin_transaction();

try {
    if (!is_null($reward['estoque'])) {
        $stmt = $conn->prepare("UPDATE club_rewards SET estoque = estoque - 1 WHERE id = ? AND estoque > 0");
        $stmt->bind_param("i", $rewardId);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            throw new Exception("Sem estoque");
        }
    }

    $ok = club_add_points(
        $conn,
        (int)$user['id'],
        $user['patient_id'],
        $pontosNecessarios,
        'resgate',
        'Resgate: ' . $reward['nome'],
        (string)$rewardId,
        'gasto'
    );

    if (!$ok) {
        throw new Exception("Erro ao registrar débito de pontos");
    }

    $stmt = $conn->prepare("
        INSERT INTO club_redemptions (
            club_user_id,
            patient_id,
            reward_id,
            reward_nome,
            pontos_gastos,
            status,
            observacao
        ) VALUES (?, ?, ?, ?, ?, 'pendente', NULL)
    ");
    $stmt->bind_param(
        "isisi",
        $user['id'],
        $user['patient_id'],
        $rewardId,
        $reward['nome'],
        $pontosNecessarios
    );
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        throw new Exception("Erro ao registrar resgate");
    }

    $conn->commit();

    club_respond([
        "ok" => true,
        "message" => "Resgate realizado com sucesso"
    ]);
} catch (Exception $e) {
    $conn->rollback();
    club_respond([
        "ok" => false,
        "error" => $e->getMessage()
    ], 500);
}
