<?php
declare(strict_types=1);

namespace App\Service;

use App\Entity\ShareToken;
use App\Repository\ShareTokenRepository;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Encoder\JWTEncoderInterface;
use Symfony\Component\HttpFoundation\BadRequestHttpException;

/**
 * Centralized service for creating and exchanging share/magic-link tokens.
 *
 * Supports any resource type (e.g., "unit_inventory_session", "client_draft").
 * Produces a short-lived JWT with ROLE_SHARE_LINK and restricted claims.
 */
class ShareLinkService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ShareTokenRepository $tokens,
        private readonly JWTEncoderInterface $jwtEncoder,
    ) {}

    /**
     * Create and persist a generic ShareToken.
     *
     * @param string                 $resourceType  e.g., "unit_inventory_session", "client_draft"
     * @param int                    $resourceId    internal id of the target resource
     * @param array<string>          $scope         e.g., ["items","photos","submit"] or ["edit_basic","submit"]
     * @param bool                   $canEdit       whether the link grants edit permissions
     * @param \DateTimeImmutable|null $expiresAt    null means no absolute expiry (not recommended)
     * @param int                    $maxUses       0 = unlimited, 1 = single-use, N = limited uses
     * @param string|null            $createdBy     optional identifier of creator (email/user id)
     */
    public function createToken(
        string $resourceType,
        int $resourceId,
        array $scope = [],
        bool $canEdit = true,
        ?\DateTimeImmutable $expiresAt = null,
        int $maxUses = 1,
        ?string $createdBy = null
    ): ShareToken {
        if ($expiresAt === null) {
            // default expiry: 3 days from now (configurable via env)
            $days = (int)($_ENV['SHARELINK_DEFAULT_EXPIRES_DAYS'] ?? getenv('SHARELINK_DEFAULT_EXPIRES_DAYS') ?: 3);
            $expiresAt = (new \DateTimeImmutable())->modify(sprintf('+%d days', $days));
        }

        $token = new ShareToken(
            resourceType: $resourceType,
            resourceId: $resourceId,
            scope: array_values(array_unique($scope)),
            canEdit: $canEdit,
            expiresAt: $expiresAt,
            maxUses: $maxUses,
            createdBy: $createdBy
        );
        $this->em->persist($token);
        $this->em->flush();

        return $token;
    }

    /**
     * Exchange a raw token string for a short-lived JWT + claims payload.
     * Increments the token's usedCount (unless maxUses = 0 meaning unlimited).
     *
     * @return array{jwt:string, claims:array<string,mixed>, tokenId:int}
     */
    public function exchange(string $rawToken): array
    {
        $share = $this->tokens->findActiveByToken($rawToken);
        if (!$share) {
            throw new BadRequestHttpException('Invalid or expired link.');
        }

        // Build JWT claims
        $now = new \DateTimeImmutable();
        $ttl = (int)($_ENV['SHARELINK_JWT_TTL_SECONDS'] ?? getenv('SHARELINK_JWT_TTL_SECONDS') ?: 10800); // 3 hours
        $exp = $now->getTimestamp() + max(300, $ttl); // at least 5 minutes

        $claims = [
            // Standard-ish fields
            'iat' => $now->getTimestamp(),
            'nbf' => $now->getTimestamp(),
            'exp' => $exp,
            'sub' => sprintf('share:%d', $share->getId()),

            // Authorization & scoping
            'roles' => ['ROLE_SHARE_LINK'],
            'share' => [
                'token'        => $share->getToken(),
                'tokenId'      => $share->getId(),
                'resourceType' => $share->getResourceType(),
                'resourceId'   => $share->getResourceId(),
                'scope'        => $share->getScope(),
                'canEdit'      => $share->canEdit(),
            ],
        ];

        // Encode the JWT (using LexikJWTAuthenticationBundle encoder)
        try {
            $jwt = $this->jwtEncoder->encode($claims);
        } catch (\Throwable $e) {
            throw new BadRequestHttpException('Failed to issue share JWT: ' . $e->getMessage());
        }

        // Mark usage if limited (maxUses > 0)
        if ($share->getMaxUses() > 0) {
            $share->markUsed();
            $this->em->persist($share);
            $this->em->flush();
        }

        return [
            'jwt'    => $jwt,
            'claims' => $claims,
            'tokenId'=> $share->getId(),
        ];
    }

    /**
     * Build a public URL for the client to use (frontend will exchange & redirect).
     * Example: https://dashboard.owners2.com/p/share/{token}
     */
    public function buildPublicUrl(ShareToken $token): string
    {
        $base = rtrim($_ENV['APP_PUBLIC_BASEURL'] ?? getenv('APP_PUBLIC_BASEURL') ?: '', '/');
        if ($base === '') {
            // fallback to relative path
            return '/p/share/' . $token->getToken();
        }
        return $base . '/p/share/' . $token->getToken();
    }
}