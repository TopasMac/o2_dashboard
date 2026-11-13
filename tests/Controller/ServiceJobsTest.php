<?php

namespace App\Tests\Controller;

use App\Entity\User;
use App\Kernel;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use PHPUnit\Framework\Attributes\IgnoreDeprecations;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

final class ServiceJobsTest extends KernelTestCase
{
    private const JOBS = '/api/service-jobs';

    protected static function getKernelClass(): string
    {
        return Kernel::class;
    }

    #[IgnoreDeprecations]
    public function testAdminSchedulingAndAccess(): void
    {
        if (getenv('RUN_SERVICE_JOB_DB_TEST') !== '1') {
            self::markTestSkipped('Requires a migrated local owners2_dev_servicejobs_test schema with unit, category and provider fixtures.');
        }

        self::bootKernel();
        $container = self::getContainer();
        $em = $container->get(EntityManagerInterface::class);
        $connection = $em->getConnection();
        self::assertSame('owners2_dev_servicejobs_test', $connection->getParams()['dbname'] ?? null);
        self::assertContains($connection->getParams()['host'] ?? null, ['localhost', '127.0.0.1']);

        $connection->beginTransaction();
        try {
            $tokens = $container->get(JWTTokenManagerInterface::class);
            $admin = $tokens->create($this->createUser($em, 'ROLE_ADMIN'));
            $manager = $tokens->create($this->createUser($em, 'ROLE_MANAGER'));
            $before = $connection->fetchOne('SELECT COUNT(*) FROM hktransactions');

            $connection->update('unit', ['status' => 'Active'], ['unit_name' => 'IT_001']);
            $connection->insert('unit', ['unit_name' => 'SERVICE_JOB_INACTIVE', 'status' => 'Inactive']);
            $inactiveId = (int) $connection->lastInsertId();

            $options = $this->json('GET', self::JOBS.'/options', $admin, 200);
            $units = array_column($options['units'], 'id', 'name');
            $categories = array_column($options['categories'], 'id', 'name');
            self::assertArrayHasKey('IT_001', $units);
            self::assertArrayNotHasKey('SERVICE_JOB_INACTIVE', $units);
            self::assertArrayHasKey('Mantenimiento', $categories);
            self::assertSame([], array_diff(array_keys($categories), ['Mantenimiento', 'Equipamiento', 'Servicios Externos']));

            $directory = $this->json('GET', '/api/service-providers', $admin, 200);
            self::assertNotEmpty($directory['providers']);
            $providerId = $directory['providers'][0]['id'];

            $payload = [
                'unitId' => $units['IT_001'],
                'categoryId' => $categories['Mantenimiento'],
                'scheduledDate' => '2026-11-12',
                'description' => 'Clean pipes',
            ];
            $invalidUnit = $this->request('POST', self::JOBS, $admin, array_replace($payload, ['unitId' => $inactiveId]));
            self::assertSame(400, $invalidUnit->getStatusCode());

            $created = $this->json('POST', self::JOBS, $admin, 201, $payload)['job'];
            self::assertSame('pending', $created['status']);
            self::assertSame('CLIENT', $created['bill_to']);
            self::assertNull($created['provider']);
            $path = self::JOBS.'/'.$created['id'];

            foreach ([
                ['GET', self::JOBS, []],
                ['GET', self::JOBS.'/options', []],
                ['POST', self::JOBS, $payload],
                ['PATCH', $path, ['status' => 'done']],
            ] as [$method, $url, $data]) {
                self::assertSame(401, $this->request($method, $url, null, $data)->getStatusCode());
                $denied = $this->request($method, $url, $manager, $data);
                self::assertSame(403, $denied->getStatusCode(), $denied->getContent());
            }

            $assigned = $this->json('PATCH', $path, $admin, 200, ['providerId' => $providerId])['job'];
            self::assertSame($providerId, $assigned['provider']['id']);
            $this->json('PATCH', $path, $admin, 200, ['status' => 'done', 'notes' => 'Completed']);
            $this->json('PATCH', $path, $admin, 200, ['bill_to' => 'OWNERS2']);
            $second = $this->json('POST', self::JOBS, $admin, 201, $payload + ['bill_to' => 'OWNERS2'])['job'];
            self::assertSame('OWNERS2', $second['bill_to']);
            $this->json('PATCH', self::JOBS.'/'.$second['id'], $admin, 200, ['bill_to' => 'CLIENT']);
            $this->json('PATCH', self::JOBS.'/'.$second['id'], $admin, 200, ['status' => 'cancelled']);

            $uncurated = $connection->fetchOne("SELECT id FROM transaction_category WHERE name NOT IN ('Mantenimiento', 'Equipamiento', 'Servicios Externos') LIMIT 1");
            self::assertNotFalse($uncurated);
            foreach ([
                ['scheduledDate' => '2026-02-30'],
                ['categoryId' => (int) $uncurated],
                ['status' => 'invalid'],
                ['bill_to' => null],
                ['bill_to' => 'GUEST'],
                ['description' => '   '],
            ] as $invalid) {
                $response = $this->request('PATCH', $path, $admin, $invalid);
                self::assertSame(400, $response->getStatusCode(), $response->getContent());
            }

            $em->clear();
            $jobs = array_column($this->json('GET', self::JOBS, $admin, 200)['jobs'], null, 'id');
            $done = $jobs[$created['id']];
            self::assertSame('IT_001', $done['unit']['name']);
            self::assertSame('Mantenimiento', $done['category']['name']);
            self::assertSame('2026-11-12', $done['scheduledDate']);
            self::assertSame('Clean pipes', $done['description']);
            self::assertSame('Completed', $done['notes']);
            self::assertSame($providerId, $done['provider']['id']);
            self::assertSame('done', $done['status']);
            self::assertSame('OWNERS2', $done['bill_to']);
            self::assertSame('CLIENT', $jobs[$second['id']]['bill_to']);
            self::assertSame('cancelled', $jobs[$second['id']]['status']);
            self::assertSame($before, $connection->fetchOne('SELECT COUNT(*) FROM hktransactions'));
        } finally {
            $connection->rollBack();
        }
    }

    private function createUser(EntityManagerInterface $em, string $role): User
    {
        $user = (new User())
            ->setEmail(bin2hex(random_bytes(8)).'@owners2.local')
            ->setPassword('unused-by-jwt-test')
            ->setRoles([$role]);
        $em->persist($user);
        $em->flush();

        return $user;
    }

    private function request(string $method, string $path, ?string $token, array $payload): Response
    {
        $server = ['HTTP_ACCEPT' => 'application/json', 'CONTENT_TYPE' => 'application/json'];
        if ($token !== null) {
            $server['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        }

        $request = Request::create($path, $method, [], [], [], $server, json_encode($payload));
        $response = self::$kernel->handle($request);
        self::$kernel->terminate($request, $response);

        return $response;
    }

    private function json(string $method, string $path, string $token, int $status, array $payload = []): array
    {
        $response = $this->request($method, $path, $token, $payload);
        self::assertSame($status, $response->getStatusCode(), $response->getContent());
        $data = json_decode($response->getContent(), true, flags: JSON_THROW_ON_ERROR);
        self::assertTrue($data['ok']);

        return $data;
    }
}
