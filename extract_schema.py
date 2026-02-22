import os
import sys
import django

sys.path.insert(0, '/Users/mohitmaurya/dev/internship')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.apps import apps
from django.db import models

def get_schema():
    schema = []
    # Only get our apps
    target_apps = ['core', 'rbac', 'documents', 'rag']
    
    for app_name in target_apps:
        try:
            app_config = apps.get_app_config(app_name)
        except LookupError:
            continue
            
        schema.append(f"## App: {app_name.upper()}\n")
        
        for model in app_config.get_models():
            schema.append(f"### Model: {model.__name__}")
            schema.append("#### Fields:")
            
            for field in model._meta.get_fields():
                field_info = f"- **{field.name}**"
                
                if field.is_relation:
                    if hasattr(field, 'related_model') and field.related_model:
                        rel_model = field.related_model.__name__
                        if isinstance(field, models.ForeignKey):
                            field_info += f" (`ForeignKey(to={rel_model})`)"
                        elif isinstance(field, models.ManyToManyField):
                            field_info += f" (`ManyToManyField(to={rel_model})`)"
                        elif isinstance(field, models.OneToOneField):
                            field_info += f" (`OneToOneField(to={rel_model})`)"
                        else:
                            field_info += f" (`Relation(to={rel_model})`)"
                    else:
                        field_info += " (`GenericRelation/ReverseRelation`)"
                else:
                    field_type = field.__class__.__name__
                    field_info += f" (`{field_type}`)"
                    
                    # Add useful constraints
                    constraints = []
                    if getattr(field, 'primary_key', False):
                        constraints.append("PK")
                    if getattr(field, 'unique', False):
                        constraints.append("UNIQUE")
                    if getattr(field, 'null', False):
                        constraints.append("NULL")
                    if getattr(field, 'blank', False):
                        constraints.append("BLANK")
                    if hasattr(field, 'max_length') and field.max_length:
                        constraints.append(f"max_length={field.max_length}")
                    if hasattr(field, 'choices') and field.choices:
                        constraints.append("CHOICES")
                        
                    if constraints:
                        field_info += f" [{', '.join(constraints)}]"
                
                schema.append(field_info)
            schema.append("") # Empty line between models
            
    return "\n".join(schema)

if __name__ == '__main__':
    print(get_schema())
