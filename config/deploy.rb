set :application, "moonu.ru"
#========================
#CONFIG
#========================
require "capistrano-offroad"
offroad_modules "defaults", "supervisord"

set :repository,  "git@github.com:pomeo/moonu.ru.git"
set :user, "pomeo"
set :port, 2222
set :use_sudo, false
set :deploy_via, :copy
set :scm, :git
#========================
#ROLES
#========================
role :app, "#{application}"
set :deploy_to, "/var/www/#{application}/www"
