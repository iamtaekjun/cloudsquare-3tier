# ===========================================
# Public Load Balancer (외부 → Web)
# ===========================================

# Target Group - Web Servers
resource "ncloud_lb_target_group" "web" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-web-tg"
  protocol    = "HTTP"
  target_type = "VSVR"
  port        = 80

  health_check {
    protocol       = "HTTP"
    http_method    = "GET"
    port           = 80
    url_path       = "/health"
    cycle          = 30
    up_threshold   = 2
    down_threshold = 2
  }

  algorithm_type = "RR"  # Round Robin
}

# Target Group Attachment - Web Servers
resource "ncloud_lb_target_group_attachment" "web" {
  count            = var.web_server_count
  target_group_no  = ncloud_lb_target_group.web.id
  target_no_list   = [ncloud_server.web[count.index].id]
}

# Public Load Balancer
resource "ncloud_lb" "public" {
  name           = "${var.project_name}-public-lb"
  network_type   = "PUBLIC"
  type           = "APPLICATION"
  subnet_no_list = [ncloud_subnet.public_lb.id]
}

# Listener - HTTP
resource "ncloud_lb_listener" "public_http" {
  load_balancer_no = ncloud_lb.public.id
  protocol         = "HTTP"
  port             = 80
  target_group_no  = ncloud_lb_target_group.web.id
}

# ===========================================
# Private Load Balancer (Web → WAS)
# ===========================================

# Target Group - WAS Servers
resource "ncloud_lb_target_group" "was" {
  vpc_no      = ncloud_vpc.main.id
  name        = "${var.project_name}-was-tg"
  protocol    = "HTTP"
  target_type = "VSVR"
  port        = 3000

  health_check {
    protocol       = "HTTP"
    http_method    = "GET"
    port           = 3000
    url_path       = "/health"
    cycle          = 30
    up_threshold   = 2
    down_threshold = 2
  }

  algorithm_type = "RR"  # Round Robin
}

# Target Group Attachment - WAS Servers
resource "ncloud_lb_target_group_attachment" "was" {
  count            = var.was_server_count
  target_group_no  = ncloud_lb_target_group.was.id
  target_no_list   = [ncloud_server.was[count.index].id]
}

# Private Load Balancer
resource "ncloud_lb" "private" {
  name           = "${var.project_name}-private-lb"
  network_type   = "PRIVATE"
  type           = "APPLICATION"
  subnet_no_list = [ncloud_subnet.private_lb.id]
}

# Listener - HTTP (API)
resource "ncloud_lb_listener" "private_http" {
  load_balancer_no = ncloud_lb.private.id
  protocol         = "HTTP"
  port             = 3000
  target_group_no  = ncloud_lb_target_group.was.id
}
