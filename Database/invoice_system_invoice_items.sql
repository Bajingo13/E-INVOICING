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
-- Table structure for table `invoice_items`
--

DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int DEFAULT NULL,
  `description` text,
  `quantity` int DEFAULT NULL,
  `unit_price` decimal(12,2) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `additional_charges` varchar(255) DEFAULT NULL,
  `other` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=294 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_items`
--

LOCK TABLES `invoice_items` WRITE;
/*!40000 ALTER TABLE `invoice_items` DISABLE KEYS */;
INSERT INTO `invoice_items` VALUES (257,87,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,'1',NULL),(258,87,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,'1',NULL),(259,87,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,'1',NULL),(260,87,'asdasdasdasasdfjhkgjfdsadasfdasdfdyuliukjfdsdasdasdsaf ajerioai [oeria[ osid ajklf akldsfj oiawj fio ja f',0,0.00,0.00,'',NULL),(261,88,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,NULL),(262,88,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(263,88,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(264,89,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,'15000.00'),(265,89,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,'15000.00'),(266,89,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,'15000.00'),(267,90,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,'15000.00'),(268,90,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,'15000.00'),(269,90,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,'15000.00'),(270,91,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,NULL),(271,91,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(272,91,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(282,95,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,NULL),(283,95,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(284,95,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(285,96,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,NULL),(286,96,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(287,96,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(288,97,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,NULL),(289,97,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(290,97,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(291,98,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,15000.00,15000.00,NULL,NULL),(292,98,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL),(293,98,'This is to bill you for processing amended articles related to reduction of directors from 5 to 4.',1,12000.00,12000.00,NULL,NULL);
/*!40000 ALTER TABLE `invoice_items` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-08 18:05:13
