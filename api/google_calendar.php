<?php
require_once __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/_common.php';
require_auth();

$client = new Google_Client();
$client->setAuthConfig('/var/www/keys/google.json');
$client->addScope(Google_Service_Calendar::CALENDAR);

$service = new Google_Service_Calendar($client);

$calendarId = 'ab8dae5cc0ae67d5d51e2df47ca8f4053ca2cd10ff56e80109a3c9991fbb4ae9@group.calendar.google.com';

$data = json_decode(file_get_contents("php://input"), true);

$action = $data['action'] ?? 'create';

try {

    if ($action === 'create') {

        $event = new Google_Service_Calendar_Event([
            'summary' => $data['titulo'],
            'description' => $data['descricao'],
            'start' => [
                'dateTime' => $data['inicio'],
                'timeZone' => 'America/Sao_Paulo',
            ],
            'end' => [
                'dateTime' => $data['fim'],
                'timeZone' => 'America/Sao_Paulo',
            ],
        ]);

        $event = $service->events->insert($calendarId, $event);

        echo json_encode([
            "ok" => true,
            "event_id" => $event->id,
            "link" => $event->htmlLink
        ]);
    }

    if ($action === 'update') {

        $event = $service->events->get($calendarId, $data['event_id']);

        $event->setSummary($data['titulo']);
        $event->setDescription($data['descricao']);

        $event->setStart(new Google_Service_Calendar_EventDateTime([
            'dateTime' => $data['inicio'],
            'timeZone' => 'America/Sao_Paulo',
        ]));

        $event->setEnd(new Google_Service_Calendar_EventDateTime([
            'dateTime' => $data['fim'],
            'timeZone' => 'America/Sao_Paulo',
        ]));

        $updatedEvent = $service->events->update($calendarId, $event->getId(), $event);

        echo json_encode(["ok" => true]);
    }

    if ($action === 'delete') {
        $service->events->delete($calendarId, $data['event_id']);
        echo json_encode(["ok" => true]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "ok" => false,
        "error" => $e->getMessage()
    ]);
}
