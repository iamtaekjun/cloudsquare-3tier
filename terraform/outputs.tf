# ===========================================
# VPC Outputs
# ===========================================
output "vpc_id" {
  description = "VPC ID"
  value       = ncloud_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR Block"
  value       = ncloud_vpc.main.ipv4_cidr_block
}

# ===========================================
# Subnet Outputs
# ===========================================
output "subnet_ids" {
  description = "Subnet IDs"
  value = {
    public_lb  = ncloud_subnet.public_lb.id
    web        = ncloud_subnet.web.id
    private_lb = ncloud_subnet.private_lb.id
    was        = ncloud_subnet.was.id
    db         = ncloud_subnet.db.id
  }
}

# ===========================================
# Load Balancer Outputs
# ===========================================
output "public_lb_domain" {
  description = "Public Load Balancer Domain (외부 접속 주소)"
  value       = ncloud_lb.public.domain
}

output "private_lb_domain" {
  description = "Private Load Balancer Domain (내부 API 주소)"
  value       = ncloud_lb.private.domain
}

# ===========================================
# 접속 정보 요약
# ===========================================
output "connection_info" {
  description = "접속 정보 요약"
  value = <<-EOT
    ================================
    Todo App 인프라 정보
    ================================

    [외부 접속 URL]
    http://${ncloud_lb.public.domain}

    [내부 API URL (Web → WAS)]
    http://${ncloud_lb.private.domain}:3000

    [DB/서버 정보]
    ※ NCP 콘솔에서 확인

    ================================
  EOT
}
