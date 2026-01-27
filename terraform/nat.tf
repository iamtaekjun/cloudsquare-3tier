# ===========================================
# NAT Gateway
# Private 서버들이 외부 인터넷 접근 시 필요
# (패키지 설치, 외부 API 호출 등)
# ===========================================

# NAT Gateway용 Public Subnet
resource "ncloud_subnet" "nat" {
  vpc_no         = ncloud_vpc.main.id
  subnet         = "10.0.5.0/24"
  zone           = var.zone
  network_acl_no = ncloud_network_acl.main.id
  subnet_type    = "PUBLIC"
  usage_type     = "NATGW"
  name           = "${var.project_name}-nat-subnet"
}

# NAT Gateway
resource "ncloud_nat_gateway" "main" {
  vpc_no    = ncloud_vpc.main.id
  subnet_no = ncloud_subnet.nat.id
  zone      = var.zone
  name      = "${var.project_name}-nat-gw"
}

# ===========================================
# Route Table for Private Subnets
# ===========================================

# Private Route Table
resource "ncloud_route_table" "private" {
  vpc_no                = ncloud_vpc.main.id
  supported_subnet_type = "PRIVATE"
  name                  = "${var.project_name}-private-rt"
}

# Route to NAT Gateway (0.0.0.0/0 -> NAT GW)
resource "ncloud_route" "private_nat" {
  route_table_no         = ncloud_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  target_type            = "NATGW"
  target_name            = ncloud_nat_gateway.main.name
  target_no              = ncloud_nat_gateway.main.id
}

# Route Table Association - Web Subnet
resource "ncloud_route_table_association" "web" {
  route_table_no = ncloud_route_table.private.id
  subnet_no      = ncloud_subnet.web.id
}

# Route Table Association - WAS Subnet
resource "ncloud_route_table_association" "was" {
  route_table_no = ncloud_route_table.private.id
  subnet_no      = ncloud_subnet.was.id
}

# Route Table Association - DB Subnet
resource "ncloud_route_table_association" "db" {
  route_table_no = ncloud_route_table.private.id
  subnet_no      = ncloud_subnet.db.id
}
