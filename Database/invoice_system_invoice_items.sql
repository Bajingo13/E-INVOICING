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
-- Table structure for table `invoice_items`
--

DROP TABLE IF EXISTS `invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `unit_price` decimal(15,2) DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `charges` varchar(255) DEFAULT NULL,
  `taxes` varchar(255) DEFAULT NULL,
  `one` varchar(255) DEFAULT NULL,
  `two` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `for` varchar(255) DEFAULT NULL,
  `to_add` varchar(255) DEFAULT NULL,
  `credit` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=71 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_items`
--

LOCK TABLES `invoice_items` WRITE;
/*!40000 ALTER TABLE `invoice_items` DISABLE KEYS */;
INSERT INTO `invoice_items` VALUES (25,132,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',2,14567.00,29134.00,NULL,NULL,'two','four',NULL,NULL,NULL,NULL),(26,132,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',3,12451.00,37353.00,NULL,NULL,'three','five',NULL,NULL,NULL,NULL),(27,132,'',0,0.00,0.00,NULL,NULL,'four','six',NULL,NULL,NULL,NULL),(64,149,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',1,500.00,500.00,NULL,NULL,NULL,NULL,NULL,'5',NULL,NULL),(65,149,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',2,600.00,1200.00,NULL,NULL,NULL,NULL,NULL,'5',NULL,NULL),(66,149,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',2,800.00,1600.00,NULL,NULL,NULL,NULL,NULL,'5',NULL,NULL),(67,150,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',2,1000.00,2000.00,NULL,NULL,NULL,NULL,NULL,NULL,'1',NULL),(68,150,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',3,500.00,1500.00,NULL,NULL,NULL,NULL,NULL,NULL,'1',NULL),(69,151,'This to bill you for processing amended articles related to reduction of directors from 5 to 4',1,1500.00,1500.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'500'),(70,151,'',0,0.00,0.00,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'');
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

-- Dump completed on 2025-10-13 10:06:44
