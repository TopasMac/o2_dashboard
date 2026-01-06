<?php
declare(strict_types=1);

namespace App\Controller\Api;

use App\Entity\NewUnit\UnitInventoryItem;
use App\Entity\NewUnit\UnitInventoryPhoto;
use App\Entity\NewUnit\UnitInventorySession;
use App\Entity\Unit;
use App\Repository\NewUnit\UnitInventoryItemRepository;
use App\Repository\NewUnit\UnitInventoryPhotoRepository;
use App\Repository\NewUnit\UnitInventorySessionRepository;
use App\Repository\UnitRepository;
use App\Service\Document\DocumentUploadService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BadRequestHttpException;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/unit-inventory', name: 'api_unit_inventory_')]
class UnitInventoryController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly UnitInventorySessionRepository $sessionRepo,
        private readonly UnitInventoryItemRepository $itemRepo,
        private readonly UnitInventoryPhotoRepository $photoRepo,
        private readonly UnitRepository $unitRepo,
        private readonly DocumentUploadService $uploader,
    ) {}

    // ---- Inventory lifecycle statuses (internal codes) ----
    private const STATUS_COLLECTING = 'collecting'; // replaces "draft"
    private const STATUS_SUBMITTED  = 'submitted';
    private const STATUS_READY      = 'ready';
    private const STATUS_SENT       = 'sent';
    private const STATUS_SIGNED     = 'signed';

    /** Small helper: check if user has elevated desktop rights */
    private function isDesktopEditor(): bool
    {
        return $this->isGranted('ROLE_ADMIN') || $this->isGranted('ROLE_MANAGER');
    }

    /** Map legacy/raw statuses to normalized internal codes */
    private function mapLegacyStatus(?string $status): ?string
    {
        if ($status === 'draft') {
            return self::STATUS_COLLECTING;
        }
        return $status;
    }

    /** Check if writes are allowed for this session given status + user role. */
    private function canEditSession(UnitInventorySession $s): bool
    {
        $status = $this->mapLegacyStatus($s->getStatus());
        if ($status === self::STATUS_COLLECTING) {
            return true; // mobile + desktop can edit
        }
        if ($status === self::STATUS_SUBMITTED) {
            return $this->isDesktopEditor(); // desktop only
        }
        // ready/sent/signed are locked unless using dedicated reopen endpoint
        return false;
    }

    /** If both PDFs are issued, auto-mark status READY (unless already later stage). */
    private function autoMarkReadyIfIssued(UnitInventorySession $s): void
    {
        $invIssued   = method_exists($s, 'getInvIssuedAt')   ? $s->getInvIssuedAt()   : null;
        $photoIssued = method_exists($s, 'getPhotoIssuedAt') ? $s->getPhotoIssuedAt() : null;
        if ($invIssued && $photoIssued) {
            $status = $s->getStatus();
            if (!\in_array($status, [self::STATUS_READY, self::STATUS_SENT, self::STATUS_SIGNED], true)) {
                $s->setStatus(self::STATUS_READY);
            }
        }
    }

    /** Normalize a session row (for GET) including optional timestamps if entity has them. */
    private function normalizeSession(UnitInventorySession $s): array
    {
        $normalizedStatus = $this->mapLegacyStatus($s->getStatus());
        $readOnly = !$this->canEditSession($s);
        return [
            'id'            => $s->getId(),
            'unitId'        => $s->getUnit()->getId(),
            'status'        => $normalizedStatus,
            'readOnly'      => $readOnly,
            'startedAt'     => $s->getStartedAt()?->format(DATE_ATOM),
            'submittedAt'   => $s->getSubmittedAt()?->format(DATE_ATOM),
            'invIssuedAt'   => method_exists($s, 'getInvIssuedAt')   ? ($s->getInvIssuedAt()?->format(DATE_ATOM))   : null,
            'photoIssuedAt' => method_exists($s, 'getPhotoIssuedAt') ? ($s->getPhotoIssuedAt()?->format(DATE_ATOM)) : null,
            'sentAt'        => method_exists($s, 'getSentAt')        ? ($s->getSentAt()?->format(DATE_ATOM))        : null,
            'signedAt'      => method_exists($s, 'getSignedAt')      ? ($s->getSignedAt()?->format(DATE_ATOM))      : null,
            'notes'         => $s->getNotes(),
        ];
    }

    /**
     * Create a new Unit Inventory Session (status=draft)
     */
    #[Route('/session', name: 'create_session', methods: ['POST'])]
    public function createSession(Request $request): Response
    {
        $payload = $request->toArray();
        $unitId  = (int)($payload['unitId'] ?? 0);
        if ($unitId <= 0) {
            throw new BadRequestHttpException('unitId is required');
        }

        /** @var Unit|null $unit */
        $unit = $this->unitRepo->find($unitId);
        if (!$unit) {
            throw new BadRequestHttpException('Unit not found');
        }

        $session = new UnitInventorySession();
        $session->setUnit($unit);
        $session->setStatus(self::STATUS_COLLECTING);

        if (!empty($payload['startedAt'])) {
            try {
                $session->setStartedAt(new \DateTimeImmutable($payload['startedAt']));
            } catch (\Throwable $e) {
                // ignore invalid date, keep null
            }
        }
        if (!empty($payload['notes'])) {
            $session->setNotes((string)$payload['notes']);
        }

        $this->em->persist($session);
        $this->em->flush();

        return $this->json([
            'ok' => true,
            'session' => [
                'id' => $session->getId(),
                'unitId' => $unit->getId(),
                'status' => $session->getStatus(),
                'startedAt' => $session->getStartedAt()?->format(DATE_ATOM),
                'submittedAt' => $session->getSubmittedAt()?->format(DATE_ATOM),
                'notes' => $session->getNotes(),
            ]
        ], Response::HTTP_CREATED);
    }

    /**
     * Get a session with items & photos (simple shape)
     */
    #[Route('/session/{id}', name: 'get_session', methods: ['GET'])]
    public function getSession(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }

        $items = [];
        foreach ($session->getItems() as $it) {
            $items[] = [
                'id' => $it->getId(),
                'area' => $it->getArea(),
                'descripcion' => $it->getDescripcion(),
                'cantidad' => $it->getCantidad(),
                'notas' => $it->getNotas(),
            ];
        }
        $photos = [];
        foreach ($session->getPhotos() as $ph) {
            $photos[] = [
                'id' => $ph->getId(),
                'area' => $ph->getArea(),
                'caption' => $ph->getCaption(),
                'fileUrl' => $ph->getFileUrl(),
                'keep' => $ph->isKeep(),
            ];
        }

        $payload = $this->normalizeSession($session);
        $payload['items']  = $items;
        $payload['photos'] = $photos;
        return $this->json(['ok' => true, 'session' => $payload]);
    }

    /**
     * Get only the items for a session
     */
    #[Route('/session/{id}/items', name: 'get_session_items', methods: ['GET'])]
    public function getSessionItems(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }
        $items = [];
        foreach ($session->getItems() as $it) {
            $items[] = [
                'id' => $it->getId(),
                'area' => $it->getArea(),
                'descripcion' => $it->getDescripcion(),
                'cantidad' => $it->getCantidad(),
                'notas' => $it->getNotas(),
            ];
        }
        return $this->json([
            'ok' => true,
            'sessionId' => $session->getId(),
            'items' => $items,
        ]);
    }

    /**
     * Get only the photos for a session
     */
    #[Route('/session/{id}/photos', name: 'get_session_photos', methods: ['GET'])]
    public function getSessionPhotos(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }
        $photos = [];
        foreach ($session->getPhotos() as $ph) {
            $photos[] = [
                'id' => $ph->getId(),
                'area' => $ph->getArea(),
                'caption' => $ph->getCaption(),
                'fileUrl' => $ph->getFileUrl(),
                'keep' => $ph->isKeep(),
            ];
        }
        return $this->json([
            'ok' => true,
            'sessionId' => $session->getId(),
            'photos' => $photos,
        ]);
    }

    /**
     * Update a session (notes and/or status)
     * Body (any of): { notes?: string|null, status?: string }
     */
    #[Route('/session/{id}', name: 'update_session', methods: ['PATCH'])]
    public function updateSession(int $id, Request $request): Response
    {
        /** @var UnitInventorySession|null $session */
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }

        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }

        $payload = $request->toArray();

        if (array_key_exists('notes', $payload)) {
            $notes = $payload['notes'];
            $session->setNotes($notes !== null ? (string)$notes : null);
        }

        if (array_key_exists('status', $payload)) {
            $next = trim((string)$payload['status']);
            if ($next === '') {
                throw new BadRequestHttpException('status cannot be empty');
            }
            $allowed = [
                self::STATUS_COLLECTING,
                self::STATUS_SUBMITTED,
                self::STATUS_READY,
                self::STATUS_SENT,
                self::STATUS_SIGNED,
            ];
            if (!\in_array($next, $allowed, true)) {
                throw new BadRequestHttpException('invalid status value');
            }
            // Additional guardrails: only desktop can move beyond SUBMITTED
            if (\in_array($next, [self::STATUS_READY, self::STATUS_SENT, self::STATUS_SIGNED], true) && !$this->isDesktopEditor()) {
                return $this->json(['ok' => false, 'error' => 'Insufficient role for this transition'], Response::HTTP_FORBIDDEN);
            }
            $session->setStatus($next);
        }

        $this->autoMarkReadyIfIssued($session);
        $this->em->flush();

        return $this->json(['ok' => true, 'session' => $this->normalizeSession($session)]);
    }

    /**
     * Update only the notes for a session (fallback route)
     * Body: { notes: string|null }
     */
    #[Route('/session/{id}/notes', name: 'update_session_notes', methods: ['POST'])]
    public function updateSessionNotes(int $id, Request $request): Response
    {
        /** @var UnitInventorySession|null $session */
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }

        if (!$this->canEditSession($session) && !$this->isDesktopEditor()) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only'], Response::HTTP_FORBIDDEN);
        }

        $payload = $request->toArray();
        if (!array_key_exists('notes', $payload)) {
            throw new BadRequestHttpException('notes is required');
        }
        $notes = $payload['notes'];
        $session->setNotes($notes !== null ? (string)$notes : null);

        $this->em->flush();

        return $this->json([
            'ok' => true,
            'session' => [
                'id' => $session->getId(),
                'notes' => $session->getNotes(),
            ]
        ]);
    }

    /**
     * Add an item row to a session
     * Body: { sessionId, area, descripcion, cantidad?, notas? }
     */
    #[Route('/item', name: 'add_item', methods: ['POST'])]
    public function addItem(Request $request): Response
    {
        $payload = $request->toArray();
        $sessionId = (int)($payload['sessionId'] ?? 0);
        $area = trim((string)($payload['area'] ?? ''));
        $descripcion = trim((string)($payload['descripcion'] ?? ''));
        $cantidad = (int)($payload['cantidad'] ?? 1);
        $notas = $payload['notas'] ?? null;

        if ($sessionId <= 0 || $area === '' || $descripcion === '') {
            throw new BadRequestHttpException('sessionId, area and descripcion are required');
        }
        $session = $this->sessionRepo->find($sessionId);
        if (!$session) {
            throw new BadRequestHttpException('Session not found');
        }
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }
        // If this is the first interaction, set startedAt now
        if ($session->getStartedAt() === null) {
            $session->setStartedAt(new \DateTimeImmutable());
        }

        $item = new UnitInventoryItem();
        $item->setSession($session)
             ->setArea($area)
             ->setDescripcion($descripcion)
             ->setCantidad(max(1, $cantidad))
             ->setNotas($notas !== null ? (string)$notas : null);

        $this->em->persist($item);
        $this->em->flush();

        return $this->json([
            'ok' => true,
            'item' => [
                'id' => $item->getId(),
                'area' => $item->getArea(),
                'descripcion' => $item->getDescripcion(),
                'cantidad' => $item->getCantidad(),
                'notas' => $item->getNotas(),
            ]
        ], Response::HTTP_CREATED);
    }

    /**
     * Update an existing item row
     * Body (any of): { area?, descripcion?, cantidad?, notas? }
     */
    #[Route('/item/{id}', name: 'update_item', methods: ['PATCH'])]
    public function updateItem(int $id, Request $request): Response
    {
        /** @var UnitInventoryItem|null $item */
        $item = $this->itemRepo->find($id);
        if (!$item) {
            return $this->json(['ok' => false, 'error' => 'Item not found'], Response::HTTP_NOT_FOUND);
        }
        $session = $item->getSession();
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }

        $payload = $request->toArray();

        if (isset($payload['area'])) {
            $area = trim((string)$payload['area']);
            if ($area === '') {
                throw new BadRequestHttpException('area cannot be empty');
            }
            $item->setArea($area);
        }
        if (isset($payload['descripcion'])) {
            $descripcion = trim((string)$payload['descripcion']);
            if ($descripcion === '') {
                throw new BadRequestHttpException('descripcion cannot be empty');
            }
            $item->setDescripcion($descripcion);
        }
        if (isset($payload['cantidad'])) {
            $cantidad = (int)$payload['cantidad'];
            $item->setCantidad(max(1, $cantidad));
        }
        if (array_key_exists('notas', $payload)) {
            $notas = $payload['notas'];
            $item->setNotas($notas !== null ? (string)$notas : null);
        }

        $this->em->flush();

        return $this->json([
            'ok' => true,
            'item' => [
                'id' => $item->getId(),
                'area' => $item->getArea(),
                'descripcion' => $item->getDescripcion(),
                'cantidad' => $item->getCantidad(),
                'notas' => $item->getNotas(),
            ]
        ]);
    }

    /**
     * Delete an item row
     */
    #[Route('/item/{id}', name: 'delete_item', methods: ['DELETE'])]
    public function deleteItem(int $id): Response
    {
        /** @var UnitInventoryItem|null $item */
        $item = $this->itemRepo->find($id);
        if (!$item) {
            return $this->json(['ok' => false, 'error' => 'Item not found'], Response::HTTP_NOT_FOUND);
        }
        $session = $item->getSession();
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }

        $this->em->remove($item);
        $this->em->flush();

        return $this->json(['ok' => true], Response::HTTP_NO_CONTENT);
    }

    /**
     * Upload a photo to a session and persist its metadata
     * Multipart form-data:
     * - sessionId (int)
     * - unitId (int) [optional, if omitted we derive from session]
     * - area (string)
     * - caption (string, optional)
     * - file (UploadedFile)
     */
    #[Route('/photo', name: 'add_photo', methods: ['POST'])]
    public function addPhoto(Request $request): Response
    {
        $sessionId = (int)$request->request->get('sessionId', 0);
        $unitId = (int)$request->request->get('unitId', 0);
        $area = trim((string)$request->request->get('area', ''));
        $caption = $request->request->get('caption');

        /** @var UploadedFile|null $file */
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile) {
            throw new BadRequestHttpException('file is required');
        }
        if ($sessionId <= 0 || $area === '') {
            throw new BadRequestHttpException('sessionId and area are required');
        }

        $session = $this->sessionRepo->find($sessionId);
        if (!$session) {
            throw new BadRequestHttpException('Session not found');
        }
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }
        // If this is the first interaction, set startedAt now
        if ($session->getStartedAt() === null) {
            $session->setStartedAt(new \DateTimeImmutable());
        }
        if ($unitId <= 0) {
            $unitId = $session->getUnit()->getId();
        }

        // Upload to S3 using DocumentUploadService
        $url = $this->uploader->uploadForInventory(
            unitId: $unitId,
            sessionId: $sessionId,
            file: $file,
            description: is_string($caption) ? $caption : $area
        );

        // Persist photo row
        $photo = new UnitInventoryPhoto();
        $photo->setSession($session)
              ->setArea($area)
              ->setCaption(is_string($caption) ? $caption : null)
              ->setFileUrl($url)
              ->setKeep(true);

        $this->em->persist($photo);
        $this->em->flush();

        return $this->json([
            'ok' => true,
            'photo' => [
                'id' => $photo->getId(),
                'area' => $photo->getArea(),
                'caption' => $photo->getCaption(),
                'fileUrl' => $photo->getFileUrl(),
                'keep' => $photo->isKeep(),
            ]
        ], Response::HTTP_CREATED);
    }

    /**
     * Update a photo (caption, keep flag, or area)
     * Body (any of): { caption?: string|null, keep?: bool, area?: string }
     */
    #[Route('/photo/{id}', name: 'update_photo', methods: ['PATCH'])]
    public function updatePhoto(int $id, Request $request): Response
    {
        /** @var UnitInventoryPhoto|null $photo */
        $photo = $this->photoRepo->find($id);
        if (!$photo) {
            return $this->json(['ok' => false, 'error' => 'Photo not found'], Response::HTTP_NOT_FOUND);
        }
        $session = $photo->getSession();
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }
    
        $payload = $request->toArray();
    
        if (array_key_exists('caption', $payload)) {
            // allow null to clear caption
            $caption = $payload['caption'];
            $photo->setCaption($caption !== null ? (string)$caption : null);
        }
    
        if (array_key_exists('keep', $payload)) {
            $keep = filter_var($payload['keep'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($keep === null) {
                throw new BadRequestHttpException('keep must be boolean');
            }
            $photo->setKeep($keep);
        }
    
        if (array_key_exists('area', $payload)) {
            $area = trim((string)$payload['area']);
            if ($area === '') {
                throw new BadRequestHttpException('area cannot be empty');
            }
            $photo->setArea($area);
        }
    
        $this->em->flush();
    
        return $this->json([
            'ok' => true,
            'photo' => [
                'id' => $photo->getId(),
                'area' => $photo->getArea(),
                'caption' => $photo->getCaption(),
                'fileUrl' => $photo->getFileUrl(),
                'keep' => $photo->isKeep(),
            ]
        ]);
    }
    
    /**
     * Delete a photo
     */
    #[Route('/photo/{id}', name: 'delete_photo', methods: ['DELETE'])]
    public function deletePhoto(int $id): Response
    {
        /** @var UnitInventoryPhoto|null $photo */
        $photo = $this->photoRepo->find($id);
        if (!$photo) {
            return $this->json(['ok' => false, 'error' => 'Photo not found'], Response::HTTP_NOT_FOUND);
        }
        $session = $photo->getSession();
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }
    
        $this->em->remove($photo);
        $this->em->flush();
    
        return $this->json(['ok' => true], Response::HTTP_NO_CONTENT);
    }

    /**
     * Delete a photo (fallback POST route)
     */
    #[Route('/photo/{id}/delete', name: 'delete_photo_fallback', methods: ['POST'])]
    public function deletePhotoFallback(int $id): Response
    {
        /** @var UnitInventoryPhoto|null $photo */
        $photo = $this->photoRepo->find($id);
        if (!$photo) {
            return $this->json(['ok' => false, 'error' => 'Photo not found'], Response::HTTP_NOT_FOUND);
        }
        $session = $photo->getSession();
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only at current status'], Response::HTTP_FORBIDDEN);
        }

        $this->em->remove($photo);
        $this->em->flush();

        return $this->json(['ok' => true], Response::HTTP_NO_CONTENT);
    }

    /**
     * List inventory sessions for a Unit (latest first) with counts
     */
    #[Route('/unit/{unitId}/sessions', name: 'unit_sessions', methods: ['GET'])]
    public function listUnitSessions(int $unitId): Response
    {
        /** @var Unit|null $unit */
        $unit = $this->unitRepo->find($unitId);
        if (!$unit) {
            return $this->json(['ok' => false, 'error' => 'Unit not found'], Response::HTTP_NOT_FOUND);
        }

        // Fetch sessions for this unit, latest first
        $sessions = $this->sessionRepo->findBy(['unit' => $unit], ['id' => 'DESC']);

        $rows = [];
        foreach ($sessions as $s) {
            // Count items/photos via collections (lazy OK for small sets)
            $itemsCount = \count($s->getItems());
            $photosCount = \count($s->getPhotos());
            $rows[] = [
                'id' => $s->getId(),
                'status' => $this->mapLegacyStatus($s->getStatus()),
                'startedAt' => $s->getStartedAt()?->format(DATE_ATOM),
                'submittedAt' => $s->getSubmittedAt()?->format(DATE_ATOM),
                'items' => $itemsCount,
                'photos' => $photosCount,
            ];
        }

        return $this->json([
            'ok' => true,
            'unitId' => $unit->getId(),
            'sessions' => $rows,
            'latest' => $rows[0] ?? null,
        ]);
    }

    /**
     * Submit a session (locks it)
     */
    #[Route('/session/{id}/submit', name: 'submit_session', methods: ['PATCH'])]
    public function submitSession(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }
        if (!$this->canEditSession($session)) {
            return $this->json(['ok' => false, 'error' => 'Session is read-only'], Response::HTTP_FORBIDDEN);
        }
        $session->setStatus(self::STATUS_SUBMITTED);
        $session->setSubmittedAt(new \DateTimeImmutable());
        $this->autoMarkReadyIfIssued($session);
        $this->em->flush();
        return $this->json(['ok' => true, 'session' => $this->normalizeSession($session)]);
    }

    /**
     * Mark session as SENT to client (desktop only). Optionally sets sentAt if entity supports it.
     */
    #[Route('/session/{id}/deliver', name: 'deliver_session', methods: ['PATCH'])]
    public function deliverSession(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }
        if (!$this->isDesktopEditor()) {
            return $this->json(['ok' => false, 'error' => 'Insufficient role'], Response::HTTP_FORBIDDEN);
        }
        $session->setStatus(self::STATUS_SENT);
        if (method_exists($session, 'setSentAt')) {
            $session->setSentAt(new \DateTimeImmutable());
        }
        $this->em->flush();
        return $this->json(['ok' => true, 'session' => $this->normalizeSession($session)]);
    }

    /**
     * Mark session as SIGNED (desktop only). Optionally sets signedAt if entity supports it.
     */
    #[Route('/session/{id}/mark-signed', name: 'mark_signed_session', methods: ['PATCH'])]
    public function markSignedSession(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }
        if (!$this->isDesktopEditor()) {
            return $this->json(['ok' => false, 'error' => 'Insufficient role'], Response::HTTP_FORBIDDEN);
        }
        $session->setStatus(self::STATUS_SIGNED);
        if (method_exists($session, 'setSignedAt')) {
            $session->setSignedAt(new \DateTimeImmutable());
        }
        $this->em->flush();
        return $this->json(['ok' => true, 'session' => $this->normalizeSession($session)]);
    }

    /**
     * Reopen a session back to COLLECTING (admin/manager only).
     */
    #[Route('/session/{id}/reopen', name: 'reopen_session', methods: ['PATCH'])]
    public function reopenSession(int $id): Response
    {
        $session = $this->sessionRepo->find($id);
        if (!$session) {
            return $this->json(['ok' => false, 'error' => 'Session not found'], Response::HTTP_NOT_FOUND);
        }
        if (!$this->isDesktopEditor()) {
            return $this->json(['ok' => false, 'error' => 'Insufficient role'], Response::HTTP_FORBIDDEN);
        }
        $session->setStatus(self::STATUS_COLLECTING);
        // do not clear issued timestamps; let history remain unless you prefer otherwise
        $this->em->flush();
        return $this->json(['ok' => true, 'session' => $this->normalizeSession($session)]);
    }
    /**
     * List inventory sessions across units (desktop review table)
     * GET /api/unit-inventory/sessions
     * Query params:
     *  - status: string (e.g., 'submitted', 'draft', 'delivered')
     *  - unitId: int
     *  - city: string (partial match)
     *  - q: string (search by unit name)
     *  - limit: int (default 50, max 100)
     *  - offset: int (default 0)
     */
    #[Route('/sessions', name: 'list_sessions', methods: ['GET'])]
    public function listSessions(Request $request): Response
    {
        // ---- Read filters ----
        $status = trim((string)($request->query->get('status', '')));
        $unitId = (int)($request->query->get('unitId', 0));
        $city   = trim((string)($request->query->get('city', '')));
        $q      = trim((string)($request->query->get('q', '')));
        $limit  = (int)($request->query->get('limit', 50));
        $offset = (int)($request->query->get('offset', 0));
        $limit  = max(1, min(100, $limit));
        $offset = max(0, $offset);
        // Back-compat: map "draft" to new "collecting"
        if ($status === 'draft') {
            $status = self::STATUS_COLLECTING;
        }

        // ---- Build main query with counts ----
        $qb = $this->em->createQueryBuilder()
            ->select([
                's.id                 AS id',
                's.status             AS status',
                's.startedAt          AS startedAt',
                's.submittedAt        AS submittedAt',
                's.invIssuedAt        AS invIssuedAt',
                's.photoIssuedAt      AS photoIssuedAt',
                'u.id                 AS unitId',
                'u.unitName           AS unitName',
                'u.city               AS city',
                'COUNT(DISTINCT i.id) AS itemsCount',
                'COUNT(DISTINCT p.id) AS photosCount',
            ])
            ->from(UnitInventorySession::class, 's')
            ->innerJoin('s.unit', 'u')
            ->leftJoin('s.items', 'i')
            ->leftJoin('s.photos', 'p')
            ->groupBy('s.id, u.id')
            ->orderBy('s.id', 'DESC')
            ->setFirstResult($offset)
            ->setMaxResults($limit);

        if ($status !== '') {
            $qb->andWhere('s.status = :status')->setParameter('status', $status);
        }
        if ($unitId > 0) {
            $qb->andWhere('u.id = :unitId')->setParameter('unitId', $unitId);
        }
        if ($city !== '') {
            $qb->andWhere('LOWER(u.city) LIKE :city')->setParameter('city', '%' . mb_strtolower($city) . '%');
        }
        if ($q !== '') {
            // Search on unit name only
            $qb->andWhere('LOWER(u.unitName) LIKE :q')->setParameter('q', '%' . mb_strtolower($q) . '%');
        }

        $rows = $qb->getQuery()->getArrayResult();

        // ---- Total count (without item/photo joins) ----
        $qbCount = $this->em->createQueryBuilder()
            ->select('COUNT(s2.id)')
            ->from(UnitInventorySession::class, 's2')
            ->innerJoin('s2.unit', 'u2');
        if ($status !== '') {
            $qbCount->andWhere('s2.status = :status')->setParameter('status', $status);
        }
        if ($unitId > 0) {
            $qbCount->andWhere('u2.id = :unitId')->setParameter('unitId', $unitId);
        }
        if ($city !== '') {
            $qbCount->andWhere('LOWER(u2.city) LIKE :city')->setParameter('city', '%' . mb_strtolower($city) . '%');
        }
        if ($q !== '') {
            $qbCount->andWhere('LOWER(u2.unitName) LIKE :q')->setParameter('q', '%' . mb_strtolower($q) . '%');
        }
        $total = (int)$qbCount->getQuery()->getSingleScalarResult();

        // ---- Normalize dates to ISO8601 strings, normalize status, and add readOnly ----
        $normalized = array_map(function (array $r): array {
            // Normalize status and add readOnly (derived)
            $r['status'] = $this->mapLegacyStatus($r['status'] ?? null);
            $isEditable = in_array($r['status'], [self::STATUS_COLLECTING, self::STATUS_SUBMITTED], true);
            $r['readOnly'] = !$isEditable;

            $r['startedAt']     = $r['startedAt']     instanceof \DateTimeInterface ? $r['startedAt']->format(DATE_ATOM) : null;
            $r['submittedAt']   = $r['submittedAt']   instanceof \DateTimeInterface ? $r['submittedAt']->format(DATE_ATOM) : null;
            $r['invIssuedAt']   = $r['invIssuedAt']   instanceof \DateTimeInterface ? $r['invIssuedAt']->format(DATE_ATOM) : null;
            $r['photoIssuedAt'] = $r['photoIssuedAt'] instanceof \DateTimeInterface ? $r['photoIssuedAt']->format(DATE_ATOM) : null;
            // Keep consistent shape
            $r['sentAt']   = $r['sentAt']   ?? null;
            $r['signedAt'] = $r['signedAt'] ?? null;
            // Cast counts
            $r['itemsCount']  = (int)$r['itemsCount'];
            $r['photosCount'] = (int)$r['photosCount'];
            // Fallbacks
            $r['unitName'] = $r['unitName'] ?? null;
            $r['city']     = $r['city'] ?? null;
            return $r;
        }, $rows);

        return $this->json([
            'ok'    => true,
            'total' => $total,
            'rows'  => $normalized,
            'limit' => $limit,
            'offset'=> $offset,
        ]);
    }
}
