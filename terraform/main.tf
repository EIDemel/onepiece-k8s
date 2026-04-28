terraform {
  required_version = ">= 1.6.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
    kubectl = {
      source  = "gavinbunney/kubectl"
      version = "~> 1.14"
    }
  }
}

# ─── Providers ────────────────────────────────────────────────────
provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}

provider "kubectl" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

# ─── Variables ────────────────────────────────────────────────────
variable "kubeconfig_path" {
  default = "~/.kube/config"
}

variable "kube_context" {
  default = "minikube"
}

variable "db_password" {
  description = "PostgreSQL password"
  sensitive   = true
  default     = "grandline"
}

variable "image_tag" {
  default = "latest"
}

# ─── Namespaces ───────────────────────────────────────────────────
module "namespaces" {
  source = "./modules/namespaces"
}

# ─── Databases ────────────────────────────────────────────────────
module "databases" {
  source      = "./modules/databases"
  namespace   = "onepiece"
  db_password = var.db_password
  depends_on  = [module.namespaces]
}

# ─── Microservices ────────────────────────────────────────────────
module "crew_service" {
  source     = "./modules/microservice"
  name       = "crew-service"
  namespace  = "onepiece"
  port       = 3001
  image      = "onepiece/crew-service:${var.image_tag}"
  replicas   = 2
  depends_on = [module.databases]
}

module "character_service" {
  source     = "./modules/microservice"
  name       = "character-service"
  namespace  = "onepiece"
  port       = 3002
  image      = "onepiece/character-service:${var.image_tag}"
  replicas   = 2
  depends_on = [module.databases]
}

module "devil_fruit_service" {
  source     = "./modules/microservice"
  name       = "devil-fruit-service"
  namespace  = "onepiece"
  port       = 3003
  image      = "onepiece/devil-fruit-service:${var.image_tag}"
  replicas   = 2
  depends_on = [module.databases]
}

module "ship_service" {
  source     = "./modules/microservice"
  name       = "ship-service"
  namespace  = "onepiece"
  port       = 3004
  image      = "onepiece/ship-service:${var.image_tag}"
  replicas   = 2
  depends_on = [module.databases]
}

module "battle_service" {
  source     = "./modules/microservice"
  name       = "battle-service"
  namespace  = "onepiece"
  port       = 3005
  image      = "onepiece/battle-service:${var.image_tag}"
  replicas   = 2
  depends_on = [module.databases]
}

# ─── Kong Gateway ─────────────────────────────────────────────────
resource "helm_release" "kong" {
  name             = "kong"
  repository       = "https://charts.konghq.com"
  chart            = "kong"
  namespace        = "onepiece-gateway"
  create_namespace = true
  version          = "2.34.0"

  set {
    name  = "ingressController.installCRDs"
    value = "false"
  }
  set {
    name  = "proxy.type"
    value = "NodePort"
  }

  depends_on = [module.namespaces]
}

# ─── Monitoring ───────────────────────────────────────────────────
resource "helm_release" "prometheus_stack" {
  name             = "monitoring"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  namespace        = "onepiece-monitoring"
  create_namespace = true
  version          = "55.0.0"
  values           = [file("${path.module}/../k8s/monitoring/prometheus-values.yaml")]

  depends_on = [module.namespaces]
}

# ─── ArgoCD ───────────────────────────────────────────────────────
resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  namespace        = "argocd"
  create_namespace = true
  version          = "5.52.0"

  set {
    name  = "server.service.type"
    value = "NodePort"
  }
}

# ─── Outputs ──────────────────────────────────────────────────────
output "services" {
  value = {
    crew      = "http://onepiece.local/api/crews"
    character = "http://onepiece.local/api/characters"
    fruit     = "http://onepiece.local/api/devil-fruits"
    ship      = "http://onepiece.local/api/ships"
    battle    = "http://onepiece.local/api/battles"
  }
}
