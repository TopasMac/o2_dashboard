<?php
declare(strict_types=1);

namespace App\Controller;

use App\Entity\ShareToken;
use App\Service\ShareLinkService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Controller for handling share / magic-link related endpoints.
 */
#[Route('/api')]
class ShareLinkController extends AbstractController
{
    public function __construct(
        private readonly ShareLinkService $shareLink,
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * Exchange a public token for a scoped, short-lived JWT.
     *
     * Accessible without auth (used by /p/share/:token in the frontend).
     *
     * Example:
     * POST /api/public/share/exchange
     * { "token": "ab12cd34..." }
     *
     * Response: { "ok": true, "jwt": "...", "claims": {...} }
     */
    #[Route('/public/share/exchange', name: 'public_share_exchange', methods: ['POST'])]
    public function exchange(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];
        $token = $data['token'] ?? null;
        if (!$token) {
            return $this->json(['ok' => false, 'error' => 'Missing token'], Response::HTTP_BAD_REQUEST);
        }

        try {
            $result = $this->shareLink->exchange($token);
            return $this->json([
                'ok' => true,
                'jwt' => $result['jwt'],
                'claims' => $result['claims'],
            ]);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => $e->getMessage(),
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    /**
     * Admin endpoint to create a new share token for a given resource.
     *
     * Example:
     * POST /api/share/create
     * {
     *   "resourceType": "unit_inventory_session",
     *   "resourceId": 17,
     *   "scope": ["items", "photos"],
     *   "canEdit": true,
     *   "expiresInDays": 3
     * }
     */
    #[Route('/share/create', name: 'share_create', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $this->denyAccessUnlessGranted('ROLE_ADMIN');

        $data = json_decode($request->getContent(), true) ?? [];
        $resourceType = $data['resourceType'] ?? null;
        $resourceId = isset($data['resourceId']) ? (int)$data['resourceId'] : null;
        if (!$resourceType || !$resourceId) {
            return $this->json(['ok' => false, 'error' => 'Missing resourceType or resourceId'], Response::HTTP_BAD_REQUEST);
        }

        $scope = $data['scope'] ?? [];
        $canEdit = (bool)($data['canEdit'] ?? true);
        $days = (int)($data['expiresInDays'] ?? 3);
        $expiresAt = (new \DateTimeImmutable())->modify("+{$days} days");
        $maxUses = (int)($data['maxUses'] ?? 1);
        $createdBy = $this->getUser()?->getUserIdentifier();

        $token = $this->shareLink->createToken(
            resourceType: $resourceType,
            resourceId: $resourceId,
            scope: $scope,
            canEdit: $canEdit,
            expiresAt: $expiresAt,
            maxUses: $maxUses,
            createdBy: $createdBy,
        );

        $url = $this->shareLink->buildPublicUrl($token);

        return $this->json([
            'ok' => true,
            'shareUrl' => $url,
            'token' => $token->getToken(),
            'expiresAt' => $token->getExpiresAt()?->format(DATE_ATOM),
            'maxUses' => $token->getMaxUses(),
        ]);
    }
}
