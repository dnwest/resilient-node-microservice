module "vpc" {
  source = "../../modules/vpc"
}

module "ecr" {
  source = "../../modules/ecr"
}

module "ecs" {
  source = "../../modules/ecs"

  image   = module.ecr.repository_url
  subnets = module.vpc.public_subnets
}