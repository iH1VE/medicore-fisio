<?php
require __DIR__ . '/_common.php';

$userTipo = $_SESSION['user_tipo'] ?? null;
if (!in_array($userTipo, ['ADMIN', 'SECRETARIA'], true)) {
    club_respond(["ok" => false, "error" => "Apenas administrador ou secretaria podem gerenciar resgates"], 403);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $res = $conn->query("
        SELECT
            r.id,
            r.club_user_id,
            r.patient_id,
            r.reward_id,
            r.reward_nome,
            r.pontos_gastos,
            r.status,
            r.observacao,
            r.created_at,
            r.updated_at,
            cu.nome AS club_user_nome
        FROM club_redemptions r
        LEFT JOIN club_users cu ON cu.id = r.club_user_id
        ORDER BY r.created_at DESC
    ");

    $items = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $items[] = $row;
        }
    }

    club_respond([
        "ok" => true,
        "items" => $items
    ]);
}

if ($method === 'POST') {
    $data = club_json_input();

    $id = (int)($data['id'] ?? 0);
    $status = trim($data['status'] ?? '');
    $observacao = trim($data['observacao'] ?? '');

    if ($id <= 0 || $status === '') {
        club_respond(["ok" => false, "error" => "ID e status são obrigatórios"], 400);
    }

    $allowed = ['pendente', 'entregue', 'utilizado', 'cancelado'];
    if (!in_array($status, $allowed, true)) {
        club_respond(["ok" => false, "error" => "Status inválido"], 400);
    }

    $stmt = $conn->prepare("
        UPDATE club_redemptions
        SET status = ?, observacao = ?
        WHERE id = ?
    ");
    $stmt->bind_param("ssi", $status, $observacao, $id);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        club_respond(["ok" => false, "error" => "Erro ao atualizar resgate"], 500);
    }

    club_respond([
        "ok" => true,
        "message" => "Resgate atualizado com sucesso"
    ]);
}

club_respond(["ok" => false, "error" => "Método não permitido"], 405);
