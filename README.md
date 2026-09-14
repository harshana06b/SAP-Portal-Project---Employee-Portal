# 🚀 Employee Portal

> **A modern Employee Self-Service Portal for seamless access to HR and Finance services through Angular, Node.js, and SAP ERP.**

## 📌 Overview

The **Employee Portal** is a web-based application developed to provide employees with quick, secure, and convenient access to essential HR and Finance services.

The application combines a modern **Angular frontend**, **Node.js backend**, and **SAP ERP integration** to simplify employee transactions and provide a centralized self-service experience.

## ✨ Features

- 🔐 **Secure Employee Login**
- 👤 **Employee & Organization Information**
- 💰 **Payslip Viewing & PDF Download**
- 📊 **Leave Balance & Utilization**
- 📅 **Leave Request Submission**
- ↩️ **Leave Request Withdrawal**
- 📜 **Complete Leave History**
- 🔗 **SAP ERP Integration**
- ⚡ **REST API-based Backend Services**

## 🛠️ Technology Stack

**Frontend**
- Angular
- TypeScript
- HTML5
- CSS3

**Backend**
- Node.js
- Express.js
- REST APIs
- JWT Authentication

**Enterprise Integration**
- SAP ERP
- SAP OData Services
- SAP PI/PO

## 🔄 Integration

The portal communicates with SAP ERP through the custom OData service:

`ZEMPLOYEE_NEW_SRV`

This integration enables the application to retrieve and process employee information, leave details, leave requests, and payslip-related data directly from SAP.

## 🎯 Objective

The primary objective of the Employee Portal is to **simplify and digitize employee HR and Finance services**, reducing dependency on manual processes while providing employees with quick and easy access to their information and transactions.

## ▶️ Run the Application

Install the required dependencies for both frontend and backend:

```bash
npm install
ng serve
