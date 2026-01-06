<?php

namespace App\Controller\Api\ICal;

use App\Entity\Unit;
use App\Service\ICal\O2PrivateIcalExportService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\HttpFoundation\Request;

class IcalExportController extends AbstractController
{
    #[Route('/ical/export/unit/{id}.ics', name: 'ical_export_unit', methods: ['GET'])]
    public function export(
        int $id,
        Request $request,
        EntityManagerInterface $em,
        O2PrivateIcalExportService $icalService
    ): Response {
        $unit = $em->getRepository(Unit::class)->find($id);
        if (!$unit) {
            return new Response('Unit not found', Response::HTTP_NOT_FOUND);
        }

        // Verify token
        $token = $request->query->get('token');
        $expected = method_exists($unit, 'getIcalExportToken') ? $unit->getIcalExportToken() : null;
        if (!$expected || !$token || !hash_equals($expected, $token)) {
            return new Response('Invalid or missing token', Response::HTTP_FORBIDDEN);
        }

        if (method_exists($unit, 'isPrivateIcalEnabled') && !$unit->isPrivateIcalEnabled()) {
            return new Response('Private iCal not enabled for this unit', Response::HTTP_FORBIDDEN);
        }

        // includeSoft=true so Hold/Block are exported as well
        $icalText = $icalService->buildForUnit($unit, true);

        $response = new Response($icalText);
        $response->headers->set('Content-Type', 'text/calendar; charset=utf-8');
        $response->headers->set('Content-Disposition', 'inline; filename="unit_' . $id . '.ics"');
        $response->headers->set('Cache-Control', 'public, max-age=300, s-maxage=300');

        return $response;
    }
}