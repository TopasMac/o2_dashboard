<?php

namespace App\Tests\Controller;

use App\Controller\ReportController;
use Knp\Snappy\Pdf;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\Request;

final class ServicePaymentsReportTest extends TestCase
{
    public function testReportRequestsActiveUnitsAndRendersOnlyIncludedUnpaidRowsForTheSelectedMonth(): void
    {
        $rows = [
            ['unitId' => 1, 'unitName' => 'Unpaid', 'hoa_amount' => '100'],
            ['unitId' => 2, 'unitName' => 'Paid', 'hoa_amount' => '200'],
            ['unitId' => 3, 'unitName' => 'Paid and emailed', 'hoa_amount' => '300'],
            ['unitId' => 4, 'unitName' => 'Unpaid and excluded', 'hoa_amount' => '400'],
        ];
        $requests = [];
        $client = new MockHttpClient(function (string $method, string $url, array $options) use (&$requests, $rows): MockResponse {
            $requests[] = $url;
            self::assertSame('GET', $method);
            self::assertContains('Authorization: Bearer synthetic-token', $options['headers']);
            parse_str(parse_url($url, PHP_URL_QUERY), $query);
            self::assertSame('2026-11', $query['yearMonth']);

            if (str_contains($url, '/expected-payments/bulk')) {
                self::assertSame('1', $query['activeOnly']);

                return new MockResponse(json_encode(['services' => ['HOA' => $rows]]));
            }

            self::assertSame('/api/service-payment-check/bulk', parse_url($url, PHP_URL_PATH));
            self::assertSame('1,2,3,4', $query['unitId']);

            return new MockResponse(json_encode([
                1 => ['paidDetailsThisMonth' => ['HOA' => null, 'Internet' => ['id' => 10]]],
                2 => ['paidDetailsThisMonth' => ['HOA' => ['id' => 20]]],
                3 => ['paidDetailsThisMonth' => ['HOA' => ['id' => 30, 'email_event_id' => 40]]],
                4 => ['paidDetailsThisMonth' => ['HOA' => null]],
            ]));
        });
        $controller = $this->getMockBuilder(ReportController::class)
            ->onlyMethods(['renderView', 'getParameter'])
            ->getMock();
        $controller->method('getParameter')->willReturn('/synthetic-report');
        $controller->expects(self::once())->method('renderView')
            ->with('reports/services_payments_html.twig', self::callback(function (array $parameters) use ($rows): bool {
                self::assertSame([$rows[0]], $parameters['rows']);
                self::assertSame(11, $parameters['month']);
                self::assertSame(2026, $parameters['year']);

                return true;
            }))
            ->willReturn('<html>Synthetic unpaid report</html>');
        $pdf = $this->createMock(Pdf::class);
        $pdf->expects(self::once())->method('getOutputFromHtml')
            ->with('<html>Synthetic unpaid report</html>')
            ->willReturn('%PDF-synthetic');

        $request = $this->request();
        $request->query->set('excludeUnitIds', '4,99');
        $response = $controller->servicesPaymentsExportPdf($request, $client, $pdf);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('application/pdf', $response->headers->get('Content-Type'));
        self::assertCount(2, $requests);
    }

    public function testMissingPaymentStatusPreventsGeneratingAnUnfilteredReport(): void
    {
        $client = new MockHttpClient([
            new MockResponse(json_encode(['services' => ['HOA' => [['unitId' => 1]]]])),
            new MockResponse('{}'),
        ]);
        $controller = $this->getMockBuilder(ReportController::class)->onlyMethods(['renderView'])->getMock();
        $controller->expects(self::never())->method('renderView');
        $pdf = $this->createMock(Pdf::class);
        $pdf->expects(self::never())->method('getOutputFromHtml');

        $response = $controller->servicesPaymentsExportPdf($this->request(), $client, $pdf);

        self::assertSame(503, $response->getStatusCode());
    }

    public function testFailedPaymentStatusRequestPreventsGeneratingAnUnfilteredReport(): void
    {
        $client = new MockHttpClient([
            new MockResponse(json_encode(['services' => ['HOA' => [['unitId' => 1]]]])),
            new MockResponse('{}', ['http_code' => 500]),
        ]);
        $controller = $this->getMockBuilder(ReportController::class)->onlyMethods(['renderView'])->getMock();
        $controller->expects(self::never())->method('renderView');
        $pdf = $this->createMock(Pdf::class);
        $pdf->expects(self::never())->method('getOutputFromHtml');

        $response = $controller->servicesPaymentsExportPdf($this->request(), $client, $pdf);

        self::assertSame(503, $response->getStatusCode());
    }

    private function request(): Request
    {
        return Request::create(
            'http://localhost/api/reports/services-payments/export.pdf?service=HOA&month=11&year=2026',
            server: ['HTTP_AUTHORIZATION' => 'Bearer synthetic-token'],
        );
    }
}
