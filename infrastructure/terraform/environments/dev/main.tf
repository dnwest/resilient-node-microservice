terraform {
  required_version = ">= 1.0"
}

provider "aws" {
  region = "us-east-1"
}

locals {
  prefix = "payment-api"
}

module "vpc" {
  source = "../../modules/vpc"
}

module "ecr" {
  source = "../../modules/ecr"

  repository_name = local.prefix
}

module "alb" {
  source = "../../modules/alb"

  prefix         = local.prefix
  vpc_id         = module.vpc.vpc_id
  subnets        = module.vpc.public_subnets
  certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}

module "ecs" {
  source = "../../modules/ecs"

  prefix            = local.prefix
  image             = module.ecr.repository_url
  subnets           = module.vpc.public_subnets
  target_group_arn  = module.alb.target_group_arn
  security_groups   = [module.alb.alb_security_group_id]
}

output "alb_dns_name" {
  description = "ALB DNS Name"
  value       = module.alb.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS Cluster Name"
  value       = module.ecs.cluster_name
}

output "ecr_repository_url" {
  description = "ECR Repository URL"
  value       = module.ecr.repository_url
}
