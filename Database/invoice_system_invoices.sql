-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: invoice_system
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(50) DEFAULT NULL,
  `bill_to` varchar(255) DEFAULT NULL,
  `address1` varchar(255) DEFAULT NULL,
  `address2` varchar(255) DEFAULT NULL,
  `tin` varchar(50) DEFAULT NULL,
  `terms` varchar(100) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `total_amount_due` decimal(12,2) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `columns` text,
  `extra_columns` text,
  `invoice_type` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=154 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
INSERT INTO `invoices` VALUES (132,'000001','Alas Oplas Co, CPAs','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','111100022220000','3 Days','2025-09-18',NULL,66487.00,NULL,NULL,'[\"one\",\"two\"]',NULL),(149,'000002','Alas Oplas Co, CPAs','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','111100022220000','4 Days','2025-10-06',NULL,3300.00,NULL,NULL,'[\"for\"]','SALES INVOICE'),(150,'000003','Alas Oplas Co, CPAs','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1111000222200001','2 Days','2025-10-06',NULL,3500.00,NULL,NULL,'[\"to_add\"]','COMMERCIAL INVOICE'),(151,'000004','Alas Oplas Co, CPAs','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','111100022220000','4 Days','2025-10-08',NULL,1500.00,NULL,NULL,'[\"credit\"]','CREDIT MEMO'),(152,'000005','Alas Oplas Co, CPAs','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1111000222200001','7 Days','2025-10-13','2025-10-20',3200.00,NULL,NULL,'[]','SERVICE INVOICE'),(153,'000006','Business Set Up and Compliance, Inc.','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','111100022220000133','2 Days','2025-10-21','2025-10-22',5040.00,NULL,NULL,'[]','SERVICE INVOICE');
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-27 13:36:58
