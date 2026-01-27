# ===========================================
# 인증 관련 변수
# ===========================================
variable "access_key" {
  description = "NCP Access Key"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "NCP Secret Key"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "NCP Region"
  type        = string
  default     = "KR"
}

variable "site" {
  description = "NCP Site (public/gov/fin)"
  type        = string
  default     = "public"
}

# ===========================================
# 프로젝트 공통 변수
# ===========================================
variable "project_name" {
  description = "프로젝트 이름"
  type        = string
  default     = "todo"
}

variable "environment" {
  description = "환경 (dev/staging/prod)"
  type        = string
  default     = "dev"
}

# ===========================================
# VPC 및 네트워크 변수
# ===========================================
variable "vpc_cidr" {
  description = "VPC CIDR 블록"
  type        = string
  default     = "10.0.0.0/16"
}

variable "zone" {
  description = "NCP Zone"
  type        = string
  default     = "KR-1"
}

# Subnet CIDR 블록
variable "subnet_cidrs" {
  description = "Subnet CIDR 블록 맵"
  type        = map(string)
  default = {
    public_lb   = "10.0.0.0/24"   # Public LB
    web         = "10.0.1.0/24"   # Web Servers
    private_lb  = "10.0.2.0/24"   # Private LB
    was         = "10.0.3.0/24"   # WAS Servers
    db          = "10.0.4.0/24"   # Database
  }
}

# ===========================================
# 서버 스펙 변수
# ===========================================
variable "server_image_product_code" {
  description = "서버 이미지 코드 (Ubuntu 20.04)"
  type        = string
  default     = "SW.VSVR.OS.LNX64.UBNTU.SVR2004.B050"
}

variable "web_server_spec" {
  description = "Web 서버 스펙"
  type        = string
  default     = "SVR.VSVR.HICPU.C002.M004.NET.SSD.B050.G002"
}

variable "was_server_spec" {
  description = "WAS 서버 스펙"
  type        = string
  default     = "SVR.VSVR.HICPU.C002.M004.NET.SSD.B050.G002"
}

# ===========================================
# 서버 수량 변수
# ===========================================
variable "web_server_count" {
  description = "Web 서버 수"
  type        = number
  default     = 2
}

variable "was_server_count" {
  description = "WAS 서버 수"
  type        = number
  default     = 2
}

# ===========================================
# 데이터베이스 변수
# ===========================================
variable "db_engine_version" {
  description = "MySQL 버전"
  type        = string
  default     = "8.0.32"
}

variable "db_server_spec" {
  description = "DB 서버 스펙"
  type        = string
  default     = "SVR.VSVR.HICPU.C002.M004.NET.SSD.B050.G002"
}

variable "db_name" {
  description = "데이터베이스 이름"
  type        = string
  default     = "tododb"
}

variable "db_user" {
  description = "데이터베이스 사용자"
  type        = string
  default     = "todouser"
}

variable "db_password" {
  description = "데이터베이스 비밀번호"
  type        = string
  sensitive   = true
}
