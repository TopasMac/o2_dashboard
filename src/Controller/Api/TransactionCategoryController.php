<?php

namespace App\Controller\Api;

use App\Entity\TransactionCategory;
use App\Repository\TransactionCategoryRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api/transaction-categories')]
class TransactionCategoryController extends AbstractController
{
    #[Route('', name: 'get_all_transaction_categories', methods: ['GET'])]
    public function getAll(TransactionCategoryRepository $transactionCategoryRepository): JsonResponse
    {
        $categories = $transactionCategoryRepository->findAll();
        return $this->json($categories, 200, [], ['groups' => 'transaction_category:read']);
    }
}