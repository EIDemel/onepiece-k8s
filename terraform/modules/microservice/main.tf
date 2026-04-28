variable "name"      {}
variable "namespace" {}
variable "port"      {}
variable "image"     {}
variable "replicas"  { default = 2 }

resource "kubernetes_deployment_v1" "service" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = { app = var.name }
  }
  spec {
    replicas = var.replicas
    selector { match_labels = { app = var.name } }
    template {
      metadata {
        labels = { app = var.name }
        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = tostring(var.port)
          "prometheus.io/path"   = "/metrics"
        }
      }
      spec {
        container {
          name  = var.name
          image = var.image
          image_pull_policy = "IfNotPresent"
          port { container_port = var.port }
          env_from {
            config_map_ref { name = "${var.name}-config" }
          }
          env_from {
            secret_ref { name = "postgres-secret" }
          }
          resources {
            requests = { memory = "128Mi", cpu = "100m" }
            limits   = { memory = "256Mi", cpu = "300m" }
          }
          readiness_probe {
            http_get { path = "/health"; port = var.port }
            initial_delay_seconds = 10
            period_seconds        = 5
          }
          liveness_probe {
            http_get { path = "/health"; port = var.port }
            initial_delay_seconds = 30
            period_seconds        = 15
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "service" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = { app = var.name }
  }
  spec {
    selector = { app = var.name }
    port {
      port        = var.port
      target_port = var.port
    }
    type = "ClusterIP"
  }
}

resource "kubernetes_horizontal_pod_autoscaler_v2" "hpa" {
  metadata {
    name      = "${var.name}-hpa"
    namespace = var.namespace
  }
  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = var.name
    }
    min_replicas = var.replicas
    max_replicas = 5
    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }
  }
}
