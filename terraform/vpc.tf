# ===========================================
# VPC
# ===========================================
resource "ncloud_vpc" "main" {
  name            = "${var.project_name}-vpc"
  ipv4_cidr_block = var.vpc_cidr
}

# ===========================================
# Network ACL (기본값 사용)
# ===========================================
resource "ncloud_network_acl" "main" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-nacl"
  description = "Network ACL for ${var.project_name}"
}

# ===========================================
# Subnets
# ===========================================

# Public Subnet - Load Balancer용
resource "ncloud_subnet" "public_lb" {
  vpc_no         = ncloud_vpc.main.id
  subnet         = var.subnet_cidrs["public_lb"]
  zone           = var.zone
  network_acl_no = ncloud_network_acl.main.id
  subnet_type    = "PUBLIC"
  usage_type     = "LOADB"
  name           = "${var.project_name}-public-lb-subnet"
}

# Private Subnet - Web 서버용
resource "ncloud_subnet" "web" {
  vpc_no         = ncloud_vpc.main.id
  subnet         = var.subnet_cidrs["web"]
  zone           = var.zone
  network_acl_no = ncloud_network_acl.main.id
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
  name           = "${var.project_name}-web-subnet"
}

# Private Subnet - Private Load Balancer용
resource "ncloud_subnet" "private_lb" {
  vpc_no         = ncloud_vpc.main.id
  subnet         = var.subnet_cidrs["private_lb"]
  zone           = var.zone
  network_acl_no = ncloud_network_acl.main.id
  subnet_type    = "PRIVATE"
  usage_type     = "LOADB"
  name           = "${var.project_name}-private-lb-subnet"
}

# Private Subnet - WAS 서버용
resource "ncloud_subnet" "was" {
  vpc_no         = ncloud_vpc.main.id
  subnet         = var.subnet_cidrs["was"]
  zone           = var.zone
  network_acl_no = ncloud_network_acl.main.id
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
  name           = "${var.project_name}-was-subnet"
}

# Private Subnet - Database용
resource "ncloud_subnet" "db" {
  vpc_no         = ncloud_vpc.main.id
  subnet         = var.subnet_cidrs["db"]
  zone           = var.zone
  network_acl_no = ncloud_network_acl.main.id
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
  name           = "${var.project_name}-db-subnet"
}
