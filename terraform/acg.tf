# ===========================================
# ACG (Access Control Group) - 방화벽
# ===========================================

# -----------------------------------------
# Public LB ACG
# -----------------------------------------
resource "ncloud_access_control_group" "lb" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-lb-acg"
  description = "ACG for Public Load Balancer"
}

resource "ncloud_access_control_group_rule" "lb_inbound" {
  access_control_group_no = ncloud_access_control_group.lb.id

  inbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "80"
    description = "HTTP from anywhere"
  }

  inbound {
    protocol    = "TCP"
    ip_block    = "0.0.0.0/0"
    port_range  = "443"
    description = "HTTPS from anywhere"
  }
}

# -----------------------------------------
# Web Server ACG
# -----------------------------------------
resource "ncloud_access_control_group" "web" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-web-acg"
  description = "ACG for Web Servers"
}

resource "ncloud_access_control_group_rule" "web_inbound" {
  access_control_group_no = ncloud_access_control_group.web.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.subnet_cidrs["public_lb"]
    port_range  = "80"
    description = "HTTP from Public LB"
  }

  inbound {
    protocol    = "TCP"
    ip_block    = var.subnet_cidrs["public_lb"]
    port_range  = "443"
    description = "HTTPS from Public LB"
  }

  inbound {
    protocol    = "TCP"
    ip_block    = var.vpc_cidr
    port_range  = "22"
    description = "SSH from VPC (for management via SSL VPN)"
  }
}

# -----------------------------------------
# Private LB ACG
# -----------------------------------------
resource "ncloud_access_control_group" "private_lb" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-private-lb-acg"
  description = "ACG for Private Load Balancer"
}

resource "ncloud_access_control_group_rule" "private_lb_inbound" {
  access_control_group_no = ncloud_access_control_group.private_lb.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.subnet_cidrs["web"]
    port_range  = "3000"
    description = "API from Web Servers"
  }
}

# -----------------------------------------
# WAS Server ACG
# -----------------------------------------
resource "ncloud_access_control_group" "was" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-was-acg"
  description = "ACG for WAS Servers"
}

resource "ncloud_access_control_group_rule" "was_inbound" {
  access_control_group_no = ncloud_access_control_group.was.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.subnet_cidrs["private_lb"]
    port_range  = "3000"
    description = "API from Private LB"
  }

  inbound {
    protocol    = "TCP"
    ip_block    = var.vpc_cidr
    port_range  = "22"
    description = "SSH from VPC (for management via SSL VPN)"
  }
}

# -----------------------------------------
# Database ACG
# -----------------------------------------
resource "ncloud_access_control_group" "db" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-db-acg"
  description = "ACG for Database"
}

resource "ncloud_access_control_group_rule" "db_inbound" {
  access_control_group_no = ncloud_access_control_group.db.id

  inbound {
    protocol    = "TCP"
    ip_block    = var.subnet_cidrs["was"]
    port_range  = "3306"
    description = "MySQL from WAS Servers"
  }
}
