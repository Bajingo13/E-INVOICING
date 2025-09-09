-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: invoice_system
-- ------------------------------------------------------
-- Server version	8.0.42

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
  `total_amount_due` decimal(12,2) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
INSERT INTO `invoices` VALUES (87,'001','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(88,'073','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(89,'073','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(90,'074','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(91,'077','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(95,'2','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(96,'3','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(97,'5','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL),(98,'2','Jade Jordan','30th Floor MDC 100 Bldg. E Rodriguez Jr. Ave., cor Eastwood Ave., Quezon City','','1123','7 DAYS','2025-08-04',39000.00,NULL);
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

-- Dump completed on 2025-09-08 18:05:12
