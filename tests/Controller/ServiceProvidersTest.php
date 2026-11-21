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

final class ServiceProvidersTest extends KernelTestCase
{
    private const DIRECTORY = '/api/service-providers';

    protected static function getKernelClass(): string
    {
        return Kernel::class;
    }

    // Kernel boot loads unrelated Doctrine mappings that still use deprecated Table options.
    #[IgnoreDeprecations]
    public function testAdminDirectoryLifecycleAndAccess(): void
    {
        if (getenv('RUN_SERVICE_PROVIDER_DB_TEST') !== '1') {
            self::markTestSkipped('Requires an isolated local MySQL test schema and synthetic JWT keys.');
        }

        self::bootKernel();
        $container = self::getContainer();
        $em = $container->get(EntityManagerInterface::class);
        $connection = $em->getConnection();
        self::assertSame('owners2_dev_test', $connection->getParams()['dbname'] ?? null);
        self::assertContains($connection->getParams()['host'] ?? null, ['localhost', '127.0.0.1']);

        $connection->beginTransaction();
        try {
            $tokens = $container->get(JWTTokenManagerInterface::class);
            $admin = $tokens->create($this->createUser($em, 'ROLE_ADMIN'));
            $manager = $tokens->create($this->createUser($em, 'ROLE_MANAGER'));
            $empty = $this->json('GET', self::DIRECTORY.'?includeInactive=1', $admin, 200);
            self::assertSame(0, $empty['count'], 'Run against an empty, isolated test database.');
            self::assertSame([], $empty['providers']);

            $name = 'Synthetic provider '.bin2hex(random_bytes(5));
            $fields = ['name' => $name, 'occupation' => 'Plumber', 'area' => 'Both'];

            $created = $this->json('POST', self::DIRECTORY, $admin, 201, $fields)['provider'];
            $detailPath = self::DIRECTORY.'/'.$created['id'];

            foreach ([
                ['GET', self::DIRECTORY, []],
                ['GET', $detailPath, []],
                ['POST', self::DIRECTORY, $fields],
                ['PATCH', $detailPath, ['isActive' => false]],
            ] as [$method, $path, $payload]) {
                self::assertSame(401, $this->request($method, $path, null, $payload)->getStatusCode());
                $denied = $this->request($method, $path, $manager, $payload);
                self::assertSame(403, $denied->getStatusCode(), $denied->getContent());
            }

            foreach (['bank_name', 'account_holder', 'clabe'] as $key) {
                self::assertNull($created[$key]);
            }

            $payment = [
                'bankName' => 'BBVA',
                'accountHolder' => 'Synthetic Account',
                'clabe' => '012345678901234567',
                'accountNumber' => '1111114234',
                'notes' => 'Synthetic directory note',
            ];
            $this->json('PATCH', $detailPath, $admin, 200, $payment);
            $em->clear();
            $detail = $this->json('GET', $detailPath, $admin, 200)['provider'];
            self::assertSame($payment['bankName'], $detail['bank_name']);
            self::assertSame($payment['accountHolder'], $detail['account_holder']);
            self::assertSame($payment['clabe'], $detail['clabe']);

            $list = $this->json('GET', self::DIRECTORY.'?city=Playa', $admin, 200);
            $rows = array_column($list['providers'], null, 'id');
            $row = $rows[$created['id']];
            self::assertSame($name, $row['name']);
            self::assertTrue($row['is_active']);
            self::assertSame($payment['bankName'], $row['bank_name']);
            self::assertSame($payment['accountHolder'], $row['account_holder']);
            self::assertSame('4234', $row['account_number_last_four']);
            self::assertSame($payment['notes'], $row['notes']);
            self::assertSame(substr($created['created_at'], 0, 10), $row['created_at']);
            foreach (['clabe', 'account_number'] as $key) {
                self::assertArrayNotHasKey($key, $row);
            }

            $this->json('PATCH', $detailPath, $admin, 200, ['name' => $name.' edited']);
            $updated = $this->json('GET', $detailPath, $admin, 200)['provider'];
            self::assertSame($name.' edited', $updated['name']);
            self::assertSame($payment['clabe'], $updated['clabe']);

            $bankDetails = ['bankName' => 'BBVA', 'accountHolder' => 'Synthetic Account'];
            $invalid = $this->request('PATCH', $detailPath, $admin, ['bankType' => 'CLABE', 'bankNumber' => '']);
            self::assertSame(400, $invalid->getStatusCode());
            $saved = $this->json('GET', $detailPath, $admin, 200)['provider'];
            self::assertSame($payment['accountNumber'], $saved['account_number']);
            $this->json('PATCH', $detailPath, $admin, 200, $bankDetails + [
                'bankType' => 'CLABE',
                'bankNumber' => '012345678901230045',
            ]);
            $em->clear();
            $saved = $this->json('GET', $detailPath, $admin, 200)['provider'];
            self::assertNull($saved['account_number']);
            self::assertSame('012345678901230045', $saved['clabe']);
            $listed = $this->json('GET', self::DIRECTORY, $admin, 200)['providers'][0];
            self::assertSame('0045', $listed['account_number_last_four']);
            self::assertArrayNotHasKey('clabe', $listed);

            $saved = $this->json('PATCH', $detailPath, $admin, 200, $bankDetails + [
                'bankType' => 'Card',
                'bankNumber' => '0011223344556677',
            ])['provider'];
            self::assertNull($saved['clabe']);
            self::assertSame('0011223344556677', $saved['account_number']);

            $this->json('PATCH', $detailPath, $admin, 200, [
                'bankName' => '',
                'accountHolder' => null,
                'clabe' => ' ',
            ]);
            $this->json('PATCH', $detailPath, $admin, 200, ['isActive' => false]);
            $em->clear();

            $inactive = $this->json('GET', $detailPath, $admin, 200)['provider'];
            self::assertSame($created['provider_id'], $inactive['provider_id']);
            self::assertFalse($inactive['is_active']);
            foreach (['bank_name', 'account_holder', 'clabe'] as $key) {
                self::assertNull($inactive[$key]);
            }

            $activeList = $this->json('GET', self::DIRECTORY, $admin, 200);
            self::assertNotContains($created['id'], array_column($activeList['providers'], 'id'));
            $all = $this->json('GET', self::DIRECTORY.'?includeInactive=1', $admin, 200);
            $allRows = array_column($all['providers'], null, 'id');
            self::assertFalse($allRows[$created['id']]['is_active']);
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

        return self::$kernel->handle(Request::create($path, $method, [], [], [], $server, json_encode($payload)));
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
